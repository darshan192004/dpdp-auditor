# ADR-008: Separate Puppeteer renderer

Transcribed verbatim from `docs/architecture.md` §14 (authoritative source).

## Status

Accepted

## Context

Chromium is memory-hungry and a crash risk.

## Decision

Dedicated renderer deployment consuming a queue.

## Alternatives

- render inside Nitro
- third-party PDF API

## Consequences

- stable web latency and independent scaling
- another service to operate
- customer data still stays in-cluster.
