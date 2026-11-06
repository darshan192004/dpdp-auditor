# ADR-011: URL-only public scanning at MVP

Transcribed verbatim from `docs/architecture.md` §14 (authoritative source).

## Status

Accepted

## Context

A GitHub App flow adds install UX, App-credential minting and caching, webhook handling, and per-repo visibility configuration before a user can run a first scan — friction that delays the core value (paste URL → DPDPA report) and expands the security surface.

## Decision

MVP scans public repositories only, submitted by pasting `https://github.com/<owner>/<repo>`; resolution and clone are anonymous over git smart-HTTP (`git ls-remote`, depth 1, no redirects). OAuth remains identity-only.

## Alternatives

- ship the App at MVP (rejected: install friction, token caching, webhook surface)
- fine-grained PATs (rejected: secret handling, revocation)

## Consequences

- first scan in under a minute with zero GitHub configuration
- no private-repo scanning, no repository listing, no webhook-triggered rescans — these return with the GitHub App in the post-MVP backlog, which supersedes ADR-004.
