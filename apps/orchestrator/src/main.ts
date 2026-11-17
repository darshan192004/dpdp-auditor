import { createApp } from './bootstrap.js';
import { loadEnv } from './config/env.js';
import { RetentionRunner } from './modules/retention/retention.runner.js';
import { ScanExecuteRunner } from './modules/runner/scan.execute.worker.js';
import { ScanExecuteWatcherRunner } from './modules/runner/scan.execute.watcher.worker.js';
import { ReportRenderRunner } from './modules/reports/report-render.worker.js';
import { startTelemetry } from './telemetry.js';

async function main(): Promise<void> {
  const env = loadEnv();
  // First: HTTP instrumentation must patch before createApp's adapter or any
  // request; `createApp` itself stays telemetry-free for tests.
  startTelemetry();
  const app = await createApp(env);
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  // After listen (like the worker's boot order): dial Redis for the hourly
  // retention schedule; `enableShutdownHooks` closes the worker on SIGTERM.
  await app.get(RetentionRunner).start();
  // Start scan execution worker
  await app.get(ScanExecuteRunner).start();
  // Start the scan.execute.watcher worker (P3-16)
  await app.get(ScanExecuteWatcherRunner).start();
  // Start report renderer worker (P5-17)
  await app.get(ReportRenderRunner).start();
}

main().catch((error: unknown) => {
  console.error('orchestrator failed to start', error);
  process.exit(1);
});
