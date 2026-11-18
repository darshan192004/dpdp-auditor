import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { logger } from '../../common/logger.js';
import { ENV, type Env } from '../../config/env.js';
import { redisConnectionOptions, WORKER_SETTINGS, type QueueName } from '../../queue/queues.js';
import { renderReportPdf } from './report-pdf.js';
import { ReportStorageService } from './report-storage.service.js';
import { ReportsService } from './reports.service.js';

export const REPORT_RENDER_QUEUE: QueueName = 'report.render';

/**
 * P5-17/P5-18: queue consumer that renders the report template for a
 * completed scan and hands the PDF to storage before marking it ready.
 */
export function createReportRenderWorker(
  env: Env,
  reports: ReportsService,
  storage: ReportStorageService,
): Worker {
  const worker = new Worker(
    REPORT_RENDER_QUEUE,
    async (job: Job) => {
      const { reportId, orgId } = job.data as {
        reportId: string;
        orgId: string;
      };

      // Template v1 over the shared view model (docs/api.md 10.6). PDFKit
      // renders a real multi-page A4 document directly from that model.
      const viewModel = await reports.viewModel(orgId, reportId);
      const pdfBuffer = await renderReportPdf(
        viewModel as unknown as Parameters<typeof renderReportPdf>[0],
      );

      // P5-19: upload to storage, compute SHA-256 + size
      const upload = storage.upload(reportId, pdfBuffer);

      // Mark report ready
      await reports.complete(orgId, reportId, { buffer: pdfBuffer.toString('base64') });

      logger.info(
        { reportId, storageKey: upload.storageKey, bytes: pdfBuffer.length },
        'report rendered',
      );
      return true;
    },
    {
      connection: redisConnectionOptions(env),
      settings: WORKER_SETTINGS,
    },
  );

  worker.on('error', (error: Error) => logger.error({ err: error }, 'report.render worker error'));

  worker.on('failed', async (job: Job | undefined, error: Error) => {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
    const { reportId } = (job?.data ?? {}) as { reportId?: string };
    if (reportId) {
      try {
        await reports.markFailed(reportId, 'Rendering failed.');
      } catch {
        logger.error({ err: error, reportId }, 'failed to mark report as failed');
      }
    }
  });

  return worker;
}

/** Started explicitly from main.ts so tests never dial Redis. */
@Injectable()
export class ReportRenderRunner implements OnApplicationShutdown {
  private worker?: Worker;
  private started = false;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly reports: ReportsService,
    private readonly storage: ReportStorageService,
  ) {}

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.worker = createReportRenderWorker(this.env, this.reports, this.storage);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
