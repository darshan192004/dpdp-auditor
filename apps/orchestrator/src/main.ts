import { createApp } from './bootstrap.js';
import { loadEnv } from './config/env.js';
import { RetentionRunner } from './modules/retention/retention.runner.js';
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
}

main().catch((error: unknown) => {
  console.error('orchestrator failed to start', error);
  process.exit(1);
});
