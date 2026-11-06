# ADR-004: GitHub App over user OAuth for repository access

Transcribed verbatim from `docs/architecture.md` §14 (authoritative source).

## Status

Superseded by ADR-011.

## Context

OAuth user tokens are broad and long-lived.

## Decision

Short-lived, repo-scoped GitHub App credentials for cloning; OAuth only for identity.

## Alternatives

- fine-grained PATs
- OAuth with repo scope

## Consequences

- least privilege and central revocation
- App install UX and webhook handling required.
