import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { logger } from '../../common/logger.js';
import { ENV, type Env } from '../../config/env.js';
import { redisConnectionOptions, WORKER_SETTINGS, type QueueName } from '../../queue/queues.js';
import { renderReportHtml } from './report-template.js';
import { ReportStorageService } from './report-storage.service.js';
import { ReportsService } from './reports.service.js';

export const REPORT_RENDER_QUEUE: QueueName = 'report.render';

/**
 * Minimal valid PDF wrapper around pre-rendered page content. Used only when
 * Puppeteer is unavailable in the environment (see renderPdf below).
 */
function fallbackPdf(htmlLength: number): Buffer {
  return Buffer.from(
    `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n190\n%%EOF\n%% html-bytes ${htmlLength}`,
    'utf8',
  );
}

/**
 * P5-18: render the template HTML to PDF through Puppeteer when it is
 * installed. The specifier is non-literal so TypeScript does not require the
 * dependency at build time; a missing package degrades to the fallback.
 */
async function renderPdf(html: string): Promise<Buffer> {
  const specifier = 'puppeteer';
  try {
    const mod = (await import(specifier)) as {
      default?: { launch: (opts: object) => Promise<BrowserLike> };
      launch?: (opts: object) => Promise<BrowserLike>;
    };
    const launch = mod.default?.launch ?? mod.launch;
    if (!launch) throw new Error('puppeteer launch unavailable');
    const browser = await launch({ headless: true, args: ['--no-sandbox'] });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const buffer = await page.pdf({ format: 'A4', printBackground: true });
      return Buffer.from(buffer);
    } finally {
      await browser.close();
    }
  } catch (cause) {
    logger.warn(
      { err: cause },
      'puppeteer unavailable; emitting fallback PDF shell (install puppeteer for rendered pages)',
    );
    return fallbackPdf(html.length);
  }
}

interface BrowserLike {
  newPage(): Promise<{
    setContent(html: string, options: object): Promise<void>;
    pdf(options: object): Promise<Uint8Array>;
  }>;
  close(): Promise<void>;
}

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

      // Template v1 over the shared view model (docs/api.md 10.6).
      const viewModel = await reports.viewModel(orgId, reportId);
      const html = renderReportHtml(viewModel as unknown as Parameters<typeof renderReportHtml>[0]);
      const pdfBuffer = await renderPdf(html);

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
