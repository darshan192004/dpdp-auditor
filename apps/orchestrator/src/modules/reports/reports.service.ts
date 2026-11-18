import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ApiError } from '../../common/api-error.js';
import { monthStart, PLAN_LIMITS } from '../../common/plan-limits.js';
import { AuditService } from '../audit/audit.service.js';
import { FindingsRepository } from '../findings/findings.repository.js';
import { OrganizationsRepository } from '../identity/organizations.repository.js';
import { QueueService } from '../../queue/queue.service.js';
import { ScansRepository } from '../scans/scans.repository.js';
import { buildReportViewModel } from './report-view-model.js';
import { EmailService } from './email.service.js';
import { ReportStorageService } from './report-storage.service.js';
import { ReportsRepository } from './reports.repository.js';
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

    // Check for existing ready report for same scan (idempotency)
    const existing = await this.reports.findByScanId(input.orgId, input.scanId);
    if (existing && existing.status === 'ready') {
      return {
        id: existing.id,
        scanId: existing.scanId,
        status: existing.status,
        format: existing.format,
        templateVersion: existing.templateVersion,
        createdAt: existing.createdAt,
        links: { self: `/api/v1/report/pdf/${existing.id}` },
      };
    }

    // P5-29: plan limit enforcement
    const org = await this.organizations.findById(input.orgId);
    if (!org) throw new ApiError('NOT_FOUND', 'The organisation does not exist.');
    const limits = PLAN_LIMITS[org.plan];
    if (limits.reportsPerMonth !== null) {
      const used = await this.reports.countCreatedSince(input.orgId, monthStart(new Date()));
      if (used >= limits.reportsPerMonth) {
        throw new ApiError('PLAN_LIMIT_EXCEEDED', 'Monthly report quota exceeded for this plan.');
      }
    }

    // Create new report row
    const report = await this.reports.create({
      orgId: input.orgId,
      scanId: input.scanId,
      templateVersion: input.template,
    });

    // Enqueue renderer job (P5-17)
    await this.queue.enqueue('report.render', 'render', {
      reportId: report.id,
      orgId: input.orgId,
      scanId: input.scanId,
      template: input.template,
    });

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

    if (report.status === 'ready') {
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
    const report = await this.assertDownloadable(orgId, reportId);
    return this.storage.signedUrl(report.storageKey!);
  }

  /** Local/self-hosted download: stream the stored PDF through the BFF. */
  async downloadFile(orgId: string, reportId: string) {
    const report = await this.assertDownloadable(orgId, reportId);
    const content = this.storage.read(report.storageKey!);
    if (!content) throw new ApiError('NOT_FOUND', 'The report file is missing.');
    return { content, filename: `dpdpa-report-${reportId}.pdf` };
  }

  /** Shared tenant/status guard + download audit for both download modes. */
  private async assertDownloadable(orgId: string, reportId: string) {
    const report = await this.reports.findById(orgId, reportId);
    if (!report) throw new ApiError('NOT_FOUND', 'The report does not exist.');
    if (report.status !== 'ready') {
      throw new ApiError('REPORT_NOT_READY', 'The report is not ready for download.');
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

    return report;
  }

  /** P5-17: mark report rendering (worker picked the job up). */
  async markRendering(orgId: string, reportId: string): Promise<void> {
    const report = await this.reports.findById(orgId, reportId);
    if (!report) throw new ApiError('NOT_FOUND', 'The report does not exist.');
    await this.reports.markRendering(reportId);
  }

  /** P5-17: mark report failed (renderer exhausted retries). */
  async markFailed(reportId: string, errorMessage: string): Promise<void> {
    await this.reports.markFailed(reportId, errorMessage);
  }

  /** P5-17: Renderer completion callback (api.md §10.6). */
  async complete(orgId: string, reportId: string, body: unknown) {
    const report = await this.reports.findById(orgId, reportId);
    if (!report) throw new ApiError('NOT_FOUND', 'The report does not exist.');

    const data = completeReportSchema.parse(body);
    const pdfBuffer = Buffer.from(data.buffer, 'base64');

    // P5-19: Upload to storage
    const upload = this.storage.upload(reportId, pdfBuffer);

    // Update report row
    await this.reports.markComplete(reportId, {
      storageKey: upload.storageKey,
      sha256: upload.sha256,
      sizeBytes: BigInt(upload.sizeBytes),
      expiresAt: upload.expiresAt,
    });

    // P5-28: Usage event for report_rendered
    const eventId = createHash('sha256')
      .update(`report_rendered:${reportId}`, 'utf8')
      .digest('hex')
      .slice(0, 32);
    await this.scans.recordUsage({
      orgId,
      scanId: report.scanId,
      eventType: 'report_rendered',
      eventId,
      quantity: 1,
      metadata: { reportId, storageKey: upload.storageKey, sizeBytes: upload.sizeBytes },
    });

    // P5-26: transactional email notification (stub)
    const org = await this.organizations.findById(orgId);
    if (org) {
      await this.email.sendReportReady({
        to: `org-${org.slug}@example.local`,
        reportId,
        scanId: report.scanId,
        downloadUrl: upload.downloadUrl,
      });
    }

    return { id: reportId, status: 'ready', ...upload };
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
