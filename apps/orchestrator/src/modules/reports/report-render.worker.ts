import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { logger } from '../../common/logger.js';
import { ENV, type Env } from '../../config/env.js';
import { redisConnectionOptions, WORKER_SETTINGS, type QueueName } from '../../queue/queues.js';
import { renderReportPdf } from './report-pdf.js';
import { renderReportHtml } from './report-template.js';
import { ReportStorageService } from './report-storage.service.js';
import { ReportsService } from './reports.service.js';

export const REPORT_RENDER_QUEUE: QueueName = 'report.render';

/**
 * Chromium exposes its browser target at a per-process path returned by
 * `/json/version`. Connecting to a bare `ws://host:port` is rejected with 404,
 * so resolve the advertised path and keep it behind the configured host.
 */
export async function resolveBrowserWsEndpoint(endpoint: string): Promise<string> {
  const parsed = new URL(endpoint);
  if (parsed.pathname !== '/' || parsed.search) return endpoint;
  const versionUrl = new URL(
    '/json/version',
    endpoint.replace(/^wss?:/, parsed.protocol === 'wss:' ? 'https:' : 'http:'),
  );
  const response = await fetch(versionUrl.toString(), { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Browser /json/version returned HTTP ${response.status}.`);
  const version = (await response.json()) as { webSocketDebuggerUrl?: string };
  if (!version.webSocketDebuggerUrl)
    throw new Error('Browser did not advertise a WebSocket endpoint.');
  const resolved = new URL(version.webSocketDebuggerUrl);
  resolved.host = parsed.host;
  return resolved.toString();
}

/** Render failures propagate to BullMQ retries; never publish an empty placeholder PDF. */
export async function renderPdf(
  html: string,
  browserWSEndpoint: string | undefined,
): Promise<Buffer> {
  if (!browserWSEndpoint)
    throw new Error('REPORTS_BROWSER_WS_ENDPOINT is required for PDF rendering.');
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.connect({
    browserWSEndpoint: await resolveBrowserWsEndpoint(browserWSEndpoint),
    wsOptions: { handshakeTimeout: 15_000 },
  });
  try {
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'load' });
      await page.waitForNetworkIdle();
      return Buffer.from(await page.pdf({ format: 'A4', printBackground: true }));
    } finally {
      await page.close();
    }
  } finally {
    browser.disconnect();
  }
}

/**
 * P5-17/P5-18: queue consumer that renders the report template for a
 * completed scan and hands the PDF to storage before marking it ready.
 */
export function createReportRenderWorker(
  env: Env,
  reports: ReportsService,
  _storage: ReportStorageService,
): Worker {
  const worker = new Worker(
    REPORT_RENDER_QUEUE,
    async (job: Job) => {
      const { reportId, orgId } = job.data as {
        reportId: string;
        orgId: string;
      };

      if (!(await reports.markRendering(orgId, reportId))) return true;

      // Template v1 over the shared view model (docs/api.md 10.6).
      const viewModel = await reports.viewModel(orgId, reportId);
      const model = viewModel as unknown as Parameters<typeof renderReportHtml>[0];
      const pdfBuffer = env.REPORTS_BROWSER_WS_ENDPOINT
        ? await renderPdf(renderReportHtml(model), env.REPORTS_BROWSER_WS_ENDPOINT)
        : await renderReportPdf(model);

      // Mark report ready
      await reports.complete(orgId, reportId, { buffer: pdfBuffer.toString('base64') });

      logger.info({ reportId, bytes: pdfBuffer.length }, 'report rendered');
      return true;
    },
    {
      connection: redisConnectionOptions(env),
      settings: WORKER_SETTINGS,
    },
  );

  worker.on('error', (error: Error) => logger.error({ err: error }, 'report.render worker error'));

  worker.on('failed', async (job: Job | undefined, error: Error) => {
    logger.error({ err: error, reportId: job?.data?.reportId }, 'report.render job failed');
    const reportId = job?.data?.reportId as string | undefined;
    if (!job || !reportId) return;
    try {
      // BullMQ emits failed for both retries and terminal failures. Stalls and
      // unrecoverable errors can be terminal before attemptsMade reaches its limit.
      if ((await job.getState()) === 'failed') {
        await reports.markFailed(reportId, 'Rendering failed.');
      }
    } catch (error) {
      logger.error({ err: error, reportId }, 'failed to finalize report failure');
    }
  });

  return worker;
}

/** Started explicitly from main.ts so tests never dial Redis. */
@Injectable()
export class ReportRenderRunner implements OnApplicationShutdown {
  private worker?: Worker;
  private started = false;
  private recoveryTimer?: ReturnType<typeof setInterval>;
  private recovering = false;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly reports: ReportsService,
    private readonly storage: ReportStorageService,
  ) {}

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.worker = createReportRenderWorker(this.env, this.reports, this.storage);
    const recover = async () => {
      if (this.recovering) return;
      this.recovering = true;
      try {
        await this.reports.recoverQueued();
      } catch (err) {
        logger.error({ err }, 'report queue recovery failed');
      } finally {
        this.recovering = false;
      }
    };
    this.recoveryTimer = setInterval(() => {
      void recover();
    }, 30_000);
    this.recoveryTimer.unref();
    await recover();
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.recoveryTimer);
    await this.worker?.close();
  }
}
