# Phase 2 — Identity and URL Resolution Implementation Plan

> **Status (2026-11-13):** Frontend phase (P4-21…P4-23 + redesign) merged at `d9a0a3c`.
> Backend domain services for identity, repos, API keys, invites, and audit exist and are
> unit-tested, but **no public HTTP surface, no OAuth/session, and no real UI** exist yet.
> This plan closes P2-03…P2-22 as atomic PRs.

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:executing-plans`. Use checkbox
> syntax (`- [ ]`) for tracking. One task = one branch = one PR.

**Goal:** A new user can sign in with GitHub, create an organisation, connect a public
repository by URL, invite members, manage API keys, and read the audit trail — with every
endpoint tenant-scoped, rate-limited, and covered by integration/security tests.

**Spec:** `docs/tasks.md` §5, `docs/api.md` §2/§5/§7/§8, `docs/security.md` §3/§4/§8.1,
`docs/design.md` §3.2/§5 route map.

**Architecture:** Public contracts live in Nitro (`apps/web/server/api|routes/**`). Nitro
holds the sealed session, derives `orgId`/`userId`, and calls HMAC-guarded
`/internal/v1/*` controllers in the orchestrator. The orchestrator owns all domain rules,
tenant filtering, plan limits, and audit writes. No domain logic in Nitro; no session in
the orchestrator.

**Stack pins:** Node 22, pnpm 9.15.9, Nuxt 4.6.4, `nuxt-auth-utils` 0.6.2 (Nuxt 4.6+
`appSecret` sessions), NestJS 12, Fastify 5, Zod 4, Prisma 5.22.0, BullMQ 5, Redis 7.

## Global constraints

- Errors use the `docs/api.md` §1.4 envelope via `apiError()`; never leak upstream detail.
- `org_id` always comes from the session/API key; never from the client.
- Role checks are server-side (`owner`, `admin`, `auditor`, `viewer` per security.md §3.4).
- No `purple|violet|gradient|glow`; tokens and token-lint stay authoritative.
- Every PR: token lint, Prettier, ESLint, typecheck, unit tests, build, and the 6 required
  GitHub contexts green; PR-Agent has no real major issues. Gates are never waived.

## Task slices (one PR each)

### [ ] P2-A — OAuth PKCE, sealed session, `/api/v1/me` (P2-03, P2-04)

- Orchestrator: `POST /internal/v1/identity/users/upsert` (GitHub profile → user) and
  `GET /internal/v1/identity/me` (user + active memberships + orgs + role + flags).
- Web: add `nuxt-auth-utils`; `NUXT_APP_SECRET`; custom `/api/auth/github` +
  `/callback` with S256 PKCE and cookie-bound `state`; `/api/auth/logout`;
  `/api/v1/me`; session middleware populates `event.context.userId/orgId`; idle
  (30 min) + absolute (8 h) timeout; real `useAppContext` hydration.
- Tests: pure authorize-URL/state/redirect helpers; callback exchange with mocked
  GitHub + orchestrator; session timeout middleware; controller delegation.

### [ ] P2-B — Organisation and members (P2-06)

- Orchestrator: `POST /internal/v1/identity/orgs` (create; creator = owner),
  `GET/PATCH /internal/v1/identity/org`, member list/add/role/remove with last-owner
  guard and plan/region change rejection.
- Web: `POST /api/v1/org` (onboarding create), `GET/PATCH /api/v1/org`,
  `/api/v1/org/members*`; role gates; onboarding wizard step 1; org settings page.
- Docs: add `POST /api/v1/org` to the endpoint index (onboarding needs it).

### [ ] P2-C — Repository resolve, save, list, detail, disconnect (P2-09, P2-12, P2-16)

- Orchestrator: internal repos controller + **enforce `PLAN_LIMITS.repositories`** in
  `ReposService.save` (count active repos inside the transaction).
- Web: `/api/v1/repos*` BFF; paste-URL dialog with resolve preview; repo list/detail;
  onboarding wizard step 2/3; settings/repositories.
- Acceptance: non-GitHub/non-HTTPS → `422`; query strings/fragments → `422`;
  private vs nonexistent → identical non-leaking response; cross-tenant → `404`.

### [ ] P2-D — Invitations (P2-21, P2-22)

- Orchestrator: internal invite create/list/accept/cleanup; hashed token, 7-day expiry,
  pending membership activation, `member.joined` audit.
- Web: `/api/v1/org/invites*`, `/invites/[token]` accept page, invite dialog and pending
  list on settings/members.

### [ ] P2-E — API keys (P2-13, P2-14)

- Orchestrator: internal create/list/revoke; apply `ApiKeyGuard` + `ApiKeyScopesGuard`
  to public scan routes; 30 s revocation cache.
- Web: `/api/v1/api-keys*` owner-gated; settings/api-keys page; plaintext shown once.
- Acceptance: key without `scan:write` → `403`; revoked key fails within 30 s.

### [ ] P2-F — Audit read and export (P2-18)

- Orchestrator: internal list (filters, pagination) and NDJSON export (100k cap,
  `audit.exported` event).
- Web: `/api/v1/audit-logs` + `/export`; real `/app/audit` page; owner/admin only.

### [ ] P2-G — Redis rate limiting (P2-17)

- Shared sliding-window counter in Redis: `/api/auth/**` 10/15 min per IP;
  `POST /api/v1/repos/resolve` 30/min per user; all other `/api/**` 300/min per user.
- `RateLimit-*` headers and `429 RATE_LIMITED`; fail closed for auth, fail open with a
  metric for non-auth if Redis is unavailable (documented decision).

### [ ] P2-H — Integration and security tests (P2-19, P2-20)

- OAuth callback (state mismatch, PKCE verifier, profile upsert), allowlist/SSRF cases,
  `ls-remote` probe, resolve rate limit `429`, tenant-scoping matrix, API-key scope
  enforcement, existence-oracle probes, session absolute/idle expiry.

## Exit criteria (docs/tasks.md §5)

- [ ] New user signs in → creates org → saves a resolved public repo in < 3 min.
- [ ] Private and nonexistent repos return the identical non-leaking error.
- [ ] Non-`github.com` and non-HTTPS URLs return `422 VALIDATION_ERROR`.
- [ ] Cross-tenant repository access returns `404`.
- [ ] Resolve above 30/min returns `429 RATE_LIMITED`.
- [ ] API key without `scan:write` cannot create a scan.
- [ ] Revoked API key fails within 30 s.

## Docs reconciled in the same PRs

- `docs/security.md`: `NUXT_APP_SECRET` replaces legacy `NUXT_SESSION_PASSWORD`;
  `nuxt-auth-utils` 0.6 session notes.
- `docs/api.md`: add `POST /api/v1/org` and invite-accept contracts.
- `README.md`, `docs/memory.md`: current-state tables reflect implemented Phase 2.
