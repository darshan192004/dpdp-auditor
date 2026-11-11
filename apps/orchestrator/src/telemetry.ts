import { createRequire } from 'node:module';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { AggregationType, type ViewOptions } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  BatchSpanProcessor,
  NoopSpanProcessor,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace';

/** Standard Prometheus scrape port (exporter default); `/metrics` path. */
export const PROMETHEUS_PORT = 9464;

/**
 * Second-granularity buckets around the §13 alert thresholds (p95 > 400 ms,
 * 2.5/5/10 s scan-ish tails). The OTel default boundaries are ms-scaled and
 * would collapse every sub-second request into one bucket.
 */
const REQUEST_DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.4, 0.5, 1, 2.5, 5, 10];

export const requestDurationView: ViewOptions = {
  instrumentName: 'api_request_duration_seconds',
  aggregation: {
    type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
    options: { boundaries: REQUEST_DURATION_BUCKETS },
  },
};

/**
 * Trace processors: batch-export to the OTLP collector when an endpoint is
 * configured (collector ships with Phase 6), otherwise record-and-drop — spans
 * still exist so W3C `traceparent` keeps one trace across Nitro → orchestrator
 * → Job, but nothing dials a collector that is not there.
 */
export function traceSpanProcessors(): SpanProcessor[] {
  const endpoint =
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  // The exporter resolves OTEL_EXPORTER_OTLP_* itself (appending /v1/traces).
  return endpoint
    ? [new BatchSpanProcessor({ exporter: new OTLPTraceExporter() })]
    : [new NoopSpanProcessor()];
}

export interface StartTelemetryOptions {
  /** Test hook: override the env-driven trace processors. */
  spanProcessors?: SpanProcessor[];
  /** Prometheus scrape port; defaults to {@link PROMETHEUS_PORT}. */
  metricsPort?: number;
}

export interface TelemetryHandle {
  shutdown(): Promise<void>;
}

/**
 * Start the OpenTelemetry SDK: HTTP instrumentation (W3C `traceparent` in and
 * out), the `/metrics` Prometheus endpoint, and `service.name=orchestrator`.
 * Called only from `main.ts` — `createApp` and every test stay telemetry-free.
 */
export function startTelemetry(options: StartTelemetryOptions = {}): TelemetryHandle {
  const sdk = new NodeSDK({
    serviceName: 'orchestrator',
    spanProcessors: options.spanProcessors ?? traceSpanProcessors(),
    metricReaders: [
      // 0.0.0.0: the exporter's default `localhost` binds only one address
      // family; the cluster scrape (pod IP) and tests (127.0.0.1) both need
      // every interface.
      new PrometheusExporter({ host: '0.0.0.0', port: options.metricsPort ?? PROMETHEUS_PORT }),
    ],
    instrumentations: [new HttpInstrumentation()],
    views: [requestDurationView],
  });
  sdk.start();
  // Enabling the instrumentations does not patch core modules the app already
  // loaded; the wrappers (http request/get + Server.prototype.emit) install on
  // the first require('http') after enable — trigger it now so server spans and
  // traceparent injection don't depend on some later incidental require.
  createRequire(import.meta.url)('node:http');

  const shutdown = async (): Promise<void> => {
    process.off('SIGTERM', onSignal);
    process.off('SIGINT', onSignal);
    await sdk.shutdown();
  };
  const onSignal = (): void => {
    void shutdown();
  };
  process.once('SIGTERM', onSignal);
  process.once('SIGINT', onSignal);
  return { shutdown };
}
