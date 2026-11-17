import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/config/env.js';
import type { ReportsService } from '../src/modules/reports/reports.service.js';
import type { ReportStorageService } from '../src/modules/reports/report-storage.service.js';
import {
  createReportRenderWorker,
  renderPdf,
  ReportRenderRunner,
} from '../src/modules/reports/report-render.worker.js';

const fakes = vi.hoisted(() => {
  const page = { setContent: vi.fn(), waitForNetworkIdle: vi.fn(), pdf: vi.fn(), close: vi.fn() };
  const browser = { newPage: vi.fn(), disconnect: vi.fn() };
  return {
    page,
    browser,
    connect: vi.fn(),
    process: vi.fn(),
    handlers: new Map<string, (...args: unknown[]) => unknown>(),
    close: vi.fn(),
  };
});
vi.mock('puppeteer-core', () => ({ default: { connect: fakes.connect } }));
vi.mock('bullmq', () => ({
  Worker: class {
    constructor(_name: string, process: (job: unknown) => Promise<unknown>) {
      fakes.process.mockImplementation(process);
    }
    on(event: string, handler: (...args: unknown[]) => unknown) {
      fakes.handlers.set(event, handler);
      return this;
    }
    close() {
      return fakes.close();
    }
  },
}));
vi.mock('../src/modules/reports/report-template.js', () => ({
  renderReportHtml: () => '<html>Report</html>',
}));

function setup() {
  fakes.page.setContent.mockResolvedValue(undefined);
  fakes.page.waitForNetworkIdle.mockResolvedValue(undefined);
  fakes.page.pdf.mockResolvedValue(Buffer.from('%PDF-rendered report'));
  fakes.page.close.mockResolvedValue(undefined);
  fakes.browser.newPage.mockResolvedValue(fakes.page);
  fakes.connect.mockResolvedValue(fakes.browser);
  const reports = {
    markRendering: vi.fn().mockResolvedValue(true),
    viewModel: vi.fn().mockResolvedValue({}),
    complete: vi.fn(),
    markFailed: vi.fn(),
    recoverQueued: vi.fn(),
  };
  const env = {
    REDIS_URL: 'redis://localhost',
    REPORTS_BROWSER_WS_ENDPOINT: 'ws://browser:9222/devtools/browser/test',
  } as Env;
  const storage = {} as ReportStorageService;
  return { reports, service: reports as unknown as ReportsService, env, storage };
}
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('report rendering', () => {
  it('uses the isolated browser and closes the page and connection after rendering', async () => {
    const { env } = setup();
    expect(await renderPdf('<html>Report</html>', env.REPORTS_BROWSER_WS_ENDPOINT)).toEqual(
      Buffer.from('%PDF-rendered report'),
    );
    expect(fakes.connect).toHaveBeenCalledWith({
      browserWSEndpoint: env.REPORTS_BROWSER_WS_ENDPOINT,
    });
    expect(fakes.page.close).toHaveBeenCalledOnce();
    expect(fakes.browser.disconnect).toHaveBeenCalledOnce();
  });
  it('fails honestly when the browser is unconfigured or rendering fails', async () => {
    const { env } = setup();
    await expect(renderPdf('report', undefined)).rejects.toThrow('REPORTS_BROWSER_WS_ENDPOINT');
    fakes.page.pdf.mockRejectedValueOnce(new Error('browser disconnected'));
    await expect(renderPdf('report', env.REPORTS_BROWSER_WS_ENDPOINT)).rejects.toThrow(
      'browser disconnected',
    );
    expect(fakes.page.close).toHaveBeenCalledOnce();
    expect(fakes.browser.disconnect).toHaveBeenCalledOnce();
  });
  it('completes a rendered report once and skips terminal reports on retry', async () => {
    const { reports, service, env, storage } = setup();
    createReportRenderWorker(env, service, storage);
    await fakes.process({ data: { orgId: 'org', reportId: 'report' } });
    expect(reports.complete).toHaveBeenCalledWith('org', 'report', {
      buffer: Buffer.from('%PDF-rendered report').toString('base64'),
    });
    reports.markRendering.mockResolvedValueOnce(false);
    await fakes.process({ data: { orgId: 'org', reportId: 'report' } });
    expect(reports.complete).toHaveBeenCalledOnce();
  });
  it('never marks an unsuccessful render ready and marks failure only after retries exhaust', async () => {
    const { reports, service, env, storage } = setup();
    createReportRenderWorker(env, service, storage);
    fakes.page.pdf.mockRejectedValueOnce(new Error('render failed'));
    await expect(fakes.process({ data: { orgId: 'org', reportId: 'report' } })).rejects.toThrow(
      'render failed',
    );
    expect(reports.complete).not.toHaveBeenCalled();
    const failed = fakes.handlers.get('failed')!;
    await failed(undefined, new Error('failure'));
    await failed(
      { data: { reportId: 'report' }, attemptsMade: 1, opts: { attempts: 3 } },
      new Error('failure'),
    );
    expect(reports.markFailed).not.toHaveBeenCalled();
    await failed(
      { data: { reportId: 'report' }, attemptsMade: 3, opts: { attempts: 3 } },
      new Error('failure'),
    );
    expect(reports.markFailed).toHaveBeenCalledExactlyOnceWith('report', 'Rendering failed.');
  });
  it('recovers queued work at startup and periodically, then clears the timer on shutdown', async () => {
    vi.useFakeTimers();
    const { reports, service, env, storage } = setup();
    const runner = new ReportRenderRunner(env, service, storage);
    await runner.start();
    await runner.start();
    expect(reports.recoverQueued).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(reports.recoverQueued).toHaveBeenCalledTimes(2);
    await runner.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(reports.recoverQueued).toHaveBeenCalledTimes(2);
    expect(fakes.close).toHaveBeenCalledOnce();
  });
});
