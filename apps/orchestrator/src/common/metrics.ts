import { metrics, type Counter, type Histogram } from '@opentelemetry/api';

// Created on first use: `bootstrap`'s module graph loads before `main()` runs
// `startTelemetry()`, and an instrument grabbed from the no-op provider at
// import time would never reach the real MeterProvider.
let requestDuration: Histogram | undefined;
let mappingMiss: Counter | undefined;

function requestDurationHistogram(): Histogram {
  requestDuration ??= metrics
    .getMeter('orchestrator')
    .createHistogram('api_request_duration_seconds', {
      description: 'HTTP request duration by route (architecture.md §13).',
    });
  return requestDuration;
}

/** `200` → `2xx` — the attribute used to derive `api_5xx_rate` at query time. */
export function statusClass(statusCode: number): string {
  return `${Math.floor(statusCode / 100)}xx`;
}

export function recordHttpRequest(
  route: string,
  method: string,
  statusCode: number,
  durationSeconds: number,
): void {
  requestDurationHistogram().record(durationSeconds, {
    route,
    method,
    status_class: statusClass(statusCode),
  });
}

function mappingMissCounter(): Counter {
  mappingMiss ??= metrics.getMeter('orchestrator').createCounter('mapping_miss_total', {
    description: 'Scanner findings that no rule-pack mapping covers (rules.md §7.2).',
  });
  return mappingMiss;
}

/**
 * P4-13. `mapping_miss` is the platform-quality signal behind the rule-pack
 * release gate: a spike means the pinned scanner emitted a rule ID the pack no
 * longer knows about, so the next release is blocked (rules.md §7.2).
 */
export function recordMappingMiss(scanner: string, ruleId: string): void {
  mappingMissCounter().add(1, { scanner, rule_id: ruleId });
}
