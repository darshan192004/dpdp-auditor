# ADR-003: One Kubernetes Job per scan

Transcribed verbatim from `docs/architecture.md` §14 (authoritative source).

## Status

Accepted

## Context

Tenant code must be isolated and destroyed.

## Decision

Ephemeral Job with gVisor and `emptyDir`.

## Alternatives

- long-lived workers with per-job temp dirs
- Firecracker microVMs

## Consequences

- strong isolation and simple cleanup
- higher cold-start cost
- scanner images must be pre-pulled.
