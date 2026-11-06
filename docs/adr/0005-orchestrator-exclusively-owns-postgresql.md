# ADR-005: Orchestrator exclusively owns PostgreSQL

Transcribed verbatim from `docs/architecture.md` §14 (authoritative source).

## Status

Accepted

## Context

Two writers create schema drift and confused ownership.

## Decision

Prisma in the orchestrator; Nitro has no DB driver.

## Alternatives

- Drizzle in Nitro for read models
- direct SQL from both

## Consequences

- one migration path and one audit trail
- Nitro read latency depends on the internal API.
