# ADR-002: Separate NestJS orchestrator

Transcribed verbatim from `docs/architecture.md` §14 (authoritative source).

## Status

Accepted

## Context

Scan orchestration, queueing, and mapping are long-running and security-sensitive.

## Decision

A dedicated NestJS service owns the domain and database.

## Alternatives

- put everything in Nitro server routes
- use Django

## Consequences

- clean boundary and independent scaling
- more deployment surface
- shared contracts package is required.
