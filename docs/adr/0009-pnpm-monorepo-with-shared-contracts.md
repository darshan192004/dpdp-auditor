# ADR-009: pnpm monorepo with shared contracts

Transcribed verbatim from `docs/architecture.md` §14 (authoritative source).

## Status

Accepted

## Context

Nitro and NestJS must agree on payloads.

## Decision

pnpm + Turborepo + `packages/contracts` with Zod schemas.

## Alternatives

- separate repos with published clients

## Consequences

- atomic contract changes
- larger CI graph
- release coupling.
