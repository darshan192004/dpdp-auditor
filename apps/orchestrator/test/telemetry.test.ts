import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import type { IncomingMessage, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  BatchSpanProcessor,
  InMemorySpanExporter,
  NoopSpanProcessor,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace';
import {
  PROMETHEUS_PORT,
  startTelemetry,
  traceSpanProcessors,
  type TelemetryHandle,
} from '../src/telemetry.js';
import { recordHttpRequest, statusClass } from '../src/common/metrics.js';

const METRICS_PORT = 19464; // fixed so the scrape assertion can address it; only this file binds it
const OTLP_ENV = ['OTEL_EXPORTER_OTLP_ENDPOINT', 'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'] as const;

// The real `node:http` exports object via require: HttpInstrumentation wraps
// that singleton when the SDK starts, while ESM imports (named or default)
// snapshot it earlier under the vitest module runner.
const nodeHttp = createRequire(import.meta.url)('node:http') as typeof import('node:http');

function scrape(path: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    nodeHttp
      .get({ host: '127.0.0.1', port: METRICS_PORT, path }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (body += chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body }));
      })
      .on('error', reject);
  });
}

async function scrapeWithRetry(
  path: string,
  tries = 60,
): Promise<{ statusCode: number; body: string }> {
  let lastError: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await scrape(path);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw lastError;
}

describe('telemetry', () => {
  const exporter = new InMemorySpanExporter();
  const seen: Record<string, string | string[] | undefined> = {};
  let target: Server;
  let handle: TelemetryHandle;
  let targetPort: number;

  beforeAll(async () => {
    target = nodeHttp.createServer((req: IncomingMessage, res) => {
      seen.traceparent = req.headers.traceparent;
      res.writeHead(200).end('pong');
    });
    await new Promise<void>((resolve) => target.listen(0, '127.0.0.1', resolve));
    targetPort = (target.address() as AddressInfo).port;
    handle = startTelemetry({
      spanProcessors: [new SimpleSpanProcessor({ exporter })],
      metricsPort: METRICS_PORT,
    });
  });

  afterAll(async () => {
    await handle.shutdown();
    await new Promise<void>((resolve) => target.close(() => resolve()));
  });

  it('propagates W3C traceparent and exports the client span', async () => {
    const body = await new Promise<string>((resolve, reject) => {
      nodeHttp
        .get(`http://127.0.0.1:${targetPort}/ping`, (res) => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => (data += chunk));
          res.on('end', () => resolve(data));
        })
        .on('error', reject);
    });
    expect(body).toBe('pong');

    // The client span ends on the response's `end`, a tick after the promise
    // above resolves; poll for the export.
    for (let i = 0; i < 40 && exporter.getFinishedSpans().length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const spans = exporter.getFinishedSpans();
    const traceparent = String(seen.traceparent);
    expect(traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);

    expect(spans.length).toBeGreaterThan(0);
    // The wire header carries exactly the exported trace id — one trace covers
    // both hops (architecture.md §13).
    expect(spans.some((span) => traceparent.includes(span.spanContext().traceId))).toBe(true);
  });

  it('serves the §13 request-duration histogram on /metrics', async () => {
    recordHttpRequest('/health', 'GET', 200, 0.12);
    const res = await scrapeWithRetry('/metrics');
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('api_request_duration_seconds_bucket');
    expect(res.body).toContain('route="/health"');
    expect(res.body).toContain('status_class="2xx"');
    // View buckets (not the ms-scaled OTel defaults) so p95 > 400 ms is expressible.
    expect(res.body).toContain('le="0.005"');
    expect(res.body).toContain('le="0.4"');
  });

  it('exposes the default Prometheus port as a constant', () => {
    expect(PROMETHEUS_PORT).toBe(9464);
  });

  it('maps status codes to alert classes', () => {
    expect(statusClass(200)).toBe('2xx');
    expect(statusClass(301)).toBe('3xx');
    expect(statusClass(404)).toBe('4xx');
    expect(statusClass(503)).toBe('5xx');
  });

  it('discards spans without an OTLP endpoint and exports when one is set', () => {
    const saved = OTLP_ENV.map((key) => process.env[key]);
    for (const key of OTLP_ENV) delete process.env[key];
    try {
      expect(traceSpanProcessors()[0]).toBeInstanceOf(NoopSpanProcessor);
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://collector:4318';
      expect(traceSpanProcessors()[0]).toBeInstanceOf(BatchSpanProcessor);
    } finally {
      OTLP_ENV.forEach((key, i) => {
        const value = saved[i];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      });
    }
  });
});
