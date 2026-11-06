# ADR-001: Nuxt Nitro is the only public API

Transcribed verbatim from `docs/architecture.md` §14 (authoritative source).

## Status

Accepted

## Context

The product needs SSR, session cookies, and a small public API.

## Decision

Nitro serves the app and proxies all domain calls.

## Alternatives

- expose NestJS directly behind the ingress
- use a separate API gateway

## Consequences

- one auth and validation surface
- an extra network hop
- Nitro must stay thin.
