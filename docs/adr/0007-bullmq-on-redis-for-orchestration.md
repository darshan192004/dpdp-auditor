# ADR-007: BullMQ on Redis for orchestration

Transcribed verbatim from `docs/architecture.md` §14 (authoritative source).

## Status

Accepted

## Context

Need delayed retries, concurrency control, and job visibility.

## Decision

BullMQ with per-scan job IDs.

## Alternatives

- Kubernetes-native queue
- SQS

## Consequences

- Redis becomes critical infrastructure
- job idempotency is mandatory.
