# Observability baseline (P0-16)

Wiring plan for logs, traces, and metrics, plus the log schema and the PII redaction
allowlist. Sources: `docs/code_style.md` §7.5, `docs/architecture.md` (tracing section),
`docs/operations.md` (retention), `docs/PRD.md` §8. SDK wiring itself ships with P1-17.

## Log schema

Pino, JSON output (code_style §7.5). Every record carries:

| Field | Type | Required | Notes |
|---|---|---|---|
| `level` | number (Pino) | always | `error` actionable, `warn` degraded, `info` lifecycle, `debug` dev only |
| `time` | ISO timestamp | always | Pino default |
| `msg` | string | always | Never tokens, cookies, repo contents, secret values, or full request bodies |
| `requestId` | string | per request | `X-Request-Id` format, `^[A-Za-z0-9_-]{8,64}$` (api.md §1.1) |
| `orgId` | string | when known | `org_…` public ID |
| `scanId` | string | when known | `scn_…` public ID |
| `traceId` | string | when a trace is active | W3C trace context (see below) |
| `route` | string | HTTP logs | Route pattern, never the raw URL with query PII |

`console.log` is banned; the Pino logger is the only logger (code_style §7.5, memory.md).

## PII redaction allowlist

Two layers, both in `@dpdpa/observability` (`redact()`) plus Pino's own `redact` option for
known log paths:

- **Allowlist (preserved verbatim):** `requestId`, `orgId`, `scanId` — the correlation trio.
- **Redact pattern (any matching key becomes `[REDACTED]`):**
  `/(pass(word)?|secret|token|authorization|cookie|api[-_]?key|email|ssn|dpk_)/i`
- **Value-level rules from security.md §6.2:** secret findings store a salted SHA-256 with a
  ≤4-character prefix and length only; log emails as `****@domain`, cards as `****1234`;
  file paths are kept, file contents are not; scanner stack traces are truncated and stripped
  of environment variables.

`redact()` deep-clones (never mutates), handles nested objects, arrays, Dates, and circular
references — covered by `packages/observability/test/redact.test.ts`.

## OpenTelemetry wiring plan

Per `docs/architecture.md`: OTel spans **Nitro → orchestrator → Kubernetes Job → callback**.

- **Context propagation:** W3C `traceparent` in internal headers; injected into the scan Job as
  the `TRACEPARENT` environment variable; the runner callback carries the context back so one
  trace covers a whole scan.
- **Scanner spans:** record duration and exit code only — **never** output content
  (zero-retention, security.md §6.1).
- **Resource attributes:** `service.name` (`web` / `orchestrator` / `renderer` / `runner`),
  `org.id`, `scan.id`.
- **Exporters:** traces → OTel collector → Tempo/Jaeger, retained 30 days (90 days sampled)
  (operations.md); metrics → collector → Prometheus → Grafana (PRD §8); logs stay Pino JSON on
  stdout for the cluster log pipeline — spans never carry log payloads.
- **Metrics (first set):** request duration histogram per route, scan queue depth and duration
  (p95 vs `budgets.json` `scanP95Ms`), scanner exit codes, PDF render duration (vs
  `pdfP95Ms`). Budgets are read from root `budgets.json` via `budgetsSchema`.

## SDK wiring (P1-17)

- `startTelemetry()` (`apps/orchestrator/src/telemetry.ts`) runs from `main.ts` only —
  `createApp` and every test stay telemetry-free.
- **HTTP instrumentation** (W3C `traceparent` in/out) + `service.name=orchestrator`.
- **Traces:** batch-exported to OTLP when `OTEL_EXPORTER_OTLP_ENDPOINT` (or
  `..._TRACES_ENDPOINT`) is set; otherwise spans are recorded and dropped — propagation still
  works, nothing dials a missing collector.
- **Metrics endpoint:** Prometheus text on `0.0.0.0:9464/metrics`. `api_request_duration_seconds`
  histogram with `route`/`method`/`status_class` labels and seconds buckets (0.005 s – 10 s,
  incl. the 0.4 s §13 alert threshold); `api_5xx_rate` is derived at query time from
  `api_request_duration_seconds_count{status_class="5xx"}`. Queue/scanner/render metrics land
  with their producers (P1-18+).

## What is deferred

- Collector/Tempo/Grafana deployment: `operations.md` runbooks, Phase 6.
