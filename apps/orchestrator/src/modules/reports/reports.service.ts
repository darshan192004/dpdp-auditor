import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { logger } from '../../common/logger.js';
import { ApiError } from '../../common/api-error.js';
import { effectivePlanLimits, monthStart } from '../../common/plan-limits.js';
import { ENV, type Env } from '../../config/env.js';
import { AuditService } from '../audit/audit.service.js';
import { FindingsRepository } from '../findings/findings.repository.js';
import { OrganizationsRepository } from '../identity/organizations.repository.js';
import { QueueService } from '../../queue/queue.service.js';
import { ScansRepository } from '../scans/scans.repository.js';
import { buildReportViewModel } from './report-view-model.js';
import { EmailService } from './email.service.js';
import { ReportStorageService } from './report-storage.service.js';
import { REPORT_RECOVERY_BATCH_SIZE, ReportsRepository } from './reports.repository.js';
import { completeReportSchema, type CreateReportInput } from './report.schemas.js';

/** api.md §6 + §10.6. Report lifecycle: request → queued → rendering → ready → download → expired. */
@Injectable()
export class ReportsService {
  constructor(
    private readonly reports: ReportsRepository,
    private readonly findings: FindingsRepository,
    private readonly scans: ScansRepository,
    private readonly audit: AuditService,
    private readonly queue: QueueService,
    private readonly storage: ReportStorageService,
    private readonly organizations: OrganizationsRepository,
    private readonly email: EmailService,
    @Inject(ENV) private readonly env?: Env,
  ) {}

  /** P5-20: Request a PDF report for a completed scan (api.md §6.1). */
  async request(input: CreateReportInput) {
    const scan = await this.scans.findById(input.orgId, input.scanId);
    if (!scan) throw new ApiError('NOT_FOUND', 'The scan does not exist.');
    if (scan.status !== 'completed') {
      throw new ApiError(
        'SCAN_NOT_READY',
        'The scan must be completed before requesting a report.',
      );
    }

    const org = await this.organizations.findById(input.orgId);
    if (!org) throw new ApiError('NOT_FOUND', 'The organisation does not exist.');
    const report = await this.reports.reserve(
      input,
      effectivePlanLimits(org.plan, this.env?.UNLIMITED_PLAN_QUOTA).reportsPerMonth,
      monthStart(new Date()),
    );
    if (report.status === 'queued') await this.enqueueReport(report);

    return {
      id: report.id,
      scanId: report.scanId,
      status: report.status,
      format: report.format,
      templateVersion: report.templateVersion,
      createdAt: report.createdAt,
      links: { self: `/api/v1/report/pdf/${report.id}` },
    };
  }

  private async enqueueReport(report: {
    id: string;
    orgId: string;
    scanId: string;
    templateVersion: string;
  }) {
    const existingJob = await this.queue.queue('report.render').getJob(report.id);
    if (existingJob && (await existingJob.getState()) === 'failed') {
      // Failed jobs are retained for a day. Reusing their ID with add() is a
      // no-op, so explicitly retry while preserving the report's durable ID.
      await existingJob.retry('failed', { resetAttemptsMade: true, resetAttemptsStarted: true });
      return;
    }
    // Keep the queued row on ambiguous Redis errors. The recovery sweep retries this
    // same durable ID, so an accepted job cannot be duplicated or lose its quota.
    await this.queue.enqueue(
      'report.render',
      'render',
      {
        reportId: report.id,
        orgId: report.orgId,
        scanId: report.scanId,
        template: report.templateVersion,
      },
      { jobId: report.id },
    );
  }

  async recoverQueued(): Promise<void> {
    for (const report of await this.reports.pending()) {
      try {
        await this.enqueueReport(report);
      } catch (err) {
        logger.error({ err, reportId: report.id }, 'queued report recovery failed');
      }
    }

    // The failed listener can lose its Redis/DB connection after rendering starts.
    // Confirm terminal failures and repair missing jobs from the durable report.
    let afterId: string | undefined;
    while (true) {
      const rendering = await this.reports.rendering(afterId);
      for (const report of rendering) {
        try {
          const job = await this.queue.queue('report.render').getJob(report.id);
          if (!job) {
            // Redis retention/loss cannot prove success or failure. Reuse the
            // durable report and quota reservation; readiness is guarded in SQL.
            if ((await this.reports.requeueRendering(report.id)).count > 0) {
              await this.enqueueReport(report);
            }
          } else if ((await job.getState()) === 'failed') {
            await this.markFailed(report.id, 'Rendering failed.');
          }
        } catch (err) {
          logger.error({ err, reportId: report.id }, 'rendering report recovery failed');
        }
      }
      if (rendering.length < REPORT_RECOVERY_BATCH_SIZE) break;
      afterId = rendering[rendering.length - 1]!.id;
    }
  }

  /** P5-20: Get report status (api.md §6.2). */
  async status(orgId: string, reportId: string) {
    const report = await this.reports.findById(orgId, reportId);
    if (!report) throw new ApiError('NOT_FOUND', 'The report does not exist.');

    const result: Record<string, unknown> = {
      id: report.id,
      scanId: report.scanId,
      status: report.status,
      format: report.format,
      createdAt: report.createdAt,
    };

    if (
      report.status === 'ready' &&
      (!report.expiresAt || report.expiresAt.getTime() > Date.now())
    ) {
      result.sizeBytes = Number(report.sizeBytes ?? 0);
      result.sha256 = report.sha256 ?? undefined;
      result.downloadUrl = report.storageKey
        ? this.storage.signedUrl(report.storageKey)
        : undefined;
      result.expiresAt = report.expiresAt ?? undefined;
      result.completedAt = report.updatedAt;
    }

    if (report.status === 'failed') {
      result.error = report.errorMessage ?? 'Rendering failed.';
    }

    return result;
  }

  /** P5-20 + P5-25: Get signed download URL and record audit event. */
  async downloadUrl(orgId: string, reportId: string) {
    const report = await this.reports.findById(orgId, reportId);
    if (!report) throw new ApiError('NOT_FOUND', 'The report does not exist.');
    if (report.status !== 'ready') {
      throw new ApiError('REPORT_NOT_READY', 'The report is not ready for download.');
    }
    if (report.expiresAt && report.expiresAt.getTime() <= Date.now()) {
      throw new ApiError('REPORT_EXPIRED', 'The report has expired.');
    }
    if (!report.storageKey) {
      throw new ApiError('NOT_FOUND', 'The report storage key is missing.');
    }

    // P5-25: audit event for download
    await this.audit.record({
      orgId,
      actorType: 'system',
      action: 'report.downloaded',
      resourceType: 'report',
      resourceId: reportId,
      metadata: { storageKey: report.storageKey },
    });

    return this.storage.signedUrl(report.storageKey);
  }

  /** Read a tenant-owned PDF only while both retention and download grant are valid. */
  async content(
    orgId: string,
    reportId: string,
    token: string | undefined,
    expires: string | undefined,
  ) {
    const report = await this.reports.findById(orgId, reportId);
    if (!report) throw new ApiError('NOT_FOUND', 'The report does not exist.');
    if (
      report.status === 'expired' ||
      (report.expiresAt && report.expiresAt.getTime() <= Date.now())
    ) {
      throw new ApiError('REPORT_EXPIRED', 'The report has expired.');
    }
    if (report.status !== 'ready') {
      throw new ApiError('REPORT_NOT_READY', 'The report is not ready for download.');
    }
    if (!report.storageKey) throw new ApiError('NOT_FOUND', 'The report storage key is missing.');
    return this.storage.read(report.storageKey, token, expires);
  }

  /** P5-17: mark report rendering (worker picked the job up). */
  async markRendering(orgId: string, reportId: string): Promise<boolean> {
    const report = await this.reports.findById(orgId, reportId);
    if (!report) throw new ApiError('NOT_FOUND', 'The report does not exist.');
    return (await this.reports.markRendering(reportId)).count > 0;
  }

  /** P5-17: mark report failed (renderer exhausted retries). */
  async markFailed(reportId: string, errorMessage: string): Promise<void> {
    await this.reports.markFailed(reportId, errorMessage);
  }

  /** P5-17: Renderer completion callback (api.md §10.6). */
  async complete(orgId: string, reportId: string, body: unknown) {
    const completion = await this.reports.transaction(async (tx) => {
      // Serialize callbacks before touching the file. Once a ready PDF commits,
      // every duplicate returns its persisted metadata without overwriting it.
      await this.reports.lockForCompletion(orgId, reportId, tx);
      const report = await this.reports.findById(orgId, reportId, tx);
      if (!report) throw new ApiError('NOT_FOUND', 'The report does not exist.');
      if (
        report.status === 'expired' ||
        (report.expiresAt && report.expiresAt.getTime() <= Date.now())
      ) {
        throw new ApiError('REPORT_EXPIRED', 'The report has expired.');
      }
      if (report.status === 'ready') {
        if (
          !report.storageKey ||
          !report.sha256 ||
          report.sizeBytes === null ||
          !report.expiresAt
        ) {
          throw new ApiError('REPORT_NOT_READY', 'The stored report metadata is incomplete.');
        }
        return {
          newlyCompleted: false,
          scanId: report.scanId,
          result: {
            id: reportId,
            status: 'ready',
            storageKey: report.storageKey,
            sha256: report.sha256,
            sizeBytes: Number(report.sizeBytes),
            expiresAt: report.expiresAt,
            downloadUrl: this.storage.signedUrl(report.storageKey),
          },
        };
      }
      if (report.status === 'failed') {
        throw new ApiError(
          'CONFLICT',
          'A failed report cannot be completed. Request a new report.',
        );
      }
      const data = completeReportSchema.parse(body);
      const pdfBuffer = Buffer.from(data.buffer, 'base64');
      const upload = this.storage.upload(reportId, pdfBuffer);
      const eventId = createHash('sha256')
        .update(`report_rendered:${reportId}`, 'utf8')
        .digest('hex')
        .slice(0, 32);
      await this.reports.markComplete(
        reportId,
        {
          storageKey: upload.storageKey,
          sha256: upload.sha256,
          sizeBytes: BigInt(upload.sizeBytes),
          expiresAt: upload.expiresAt,
        },
        tx,
      );
      await this.scans.recordUsage(
        {
          orgId,
          scanId: report.scanId,
          eventType: 'report_rendered',
          eventId,
          quantity: 1,
          metadata: { reportId, storageKey: upload.storageKey, sizeBytes: upload.sizeBytes },
        },
        tx,
      );
      return {
        newlyCompleted: true,
        scanId: report.scanId,
        result: { id: reportId, status: 'ready', ...upload },
      };
    });
    // A duplicate callback does not send another notification.
    if (completion.newlyCompleted) {
      const org = await this.organizations.findById(orgId);
      if (org)
        await this.email.sendReportReady({
          to: `org-${org.slug}@example.local`,
          reportId,
          scanId: completion.scanId,
          downloadUrl: completion.result.downloadUrl,
        });
    }
    return completion.result;
  }

  /** Read-only view model for dashboard/renderer (api.md §10.6). */
  async viewModel(orgId: string, reportId: string) {
    const report = await this.reports.findById(orgId, reportId);
    if (!report) throw new ApiError('NOT_FOUND', 'The report does not exist.');
    if (report.status === 'expired') {
      throw new ApiError('REPORT_EXPIRED', 'The report has expired.');
    }

    const findings = await this.findings.topForScan(report.scanId, orgId);
    return buildReportViewModel({
      report,
      scan: report.scan,
      organization: report.organization,
      findings,
    });
  }
}
