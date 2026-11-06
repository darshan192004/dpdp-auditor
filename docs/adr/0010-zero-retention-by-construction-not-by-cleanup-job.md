# ADR-010: Zero-retention by construction, not by cleanup job

Transcribed verbatim from `docs/architecture.md` §14 (authoritative source).

## Status

Accepted

## Context

A cleanup cron can fail silently.

## Decision

Source lives only on pod `emptyDir`; no code path writes it elsewhere.

## Alternatives

- scan then delete from a PVC
- object-storage staging

## Consequences

- no post-hoc debugging on source
- deletion is verifiable by architecture rather than by a job.
