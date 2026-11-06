# ADR-006: Normalise to an internal finding schema

Transcribed verbatim from `docs/architecture.md` §14 (authoritative source).

## Status

Accepted

## Context

Semgrep emits SARIF, Checkov emits JSON/SARIF, Gitleaks emits JSON.

## Decision

Adapters convert all output to `NormalizedFinding` before mapping.

## Alternatives

- map directly from each format

## Consequences

- one mapping engine and one UI
- adapters must be maintained per scanner upgrade.
