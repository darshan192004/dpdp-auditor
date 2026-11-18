# Frontend rebuild design — Signal Console

**Date:** 2026-11-18
**Status:** Approved for implementation planning
**Scope:** Full rebuild of `apps/web` in place, behind a dev-only flag, using the chosen `DESIGN.md`.

## Context

`DESIGN.md` was selected from `VoltAgent/awesome-design-md` and committed at `0606c92`. It defines a dark, evidence-first "Signal Console" for the auditor: pure-black rail, carbon ink ladder, one signal green accent, Geist Sans/Mono, and a signature ScoreCard that never shows a score without coverage and contributing findings.

The current `apps/web` predates that document. `DESIGN.md` line 95 currently says the incumbent CSS is the source of truth where the two disagree, which prevents the document from acting as a specification.

## Decisions

1. **Fix scope:** the MiroFish findings belong to the external scan target and are not changed here. Our own repo was scanned (`e4fab596-dfa2-4926-951a-bea92d31701f`): 37 findings, 4 high, 33 medium. The 4 high are the documented fake AWS key `AKIA1234567890ABCDEF` in `docs/fingerprint-spec.md` and its allowlist entries in `.gitleaks.toml`; semgrep does not honour gitleaks allowlists, so they are false positives. The 2 non-literal RegExp findings use a const prefix tuple, not user input. No real high-severity issue exists in this repo. Medium findings are mostly mutable action tags and are deferred.
2. **Design source:** replace the current token layer with the `DESIGN.md` tokens and update `DESIGN.md` to remove the conflicting "incumbent CSS is source of truth" line. The document and code must agree.
3. **Scope:** full frontend rebuild, all existing screens plus new ones, replacing `apps/web` in place.
4. **Approach:** strangler in place. Current screens stay working behind a dev-only flag while new screens are built one at a time; old code is deleted after parity.
5. **New screens (bounded to two):** Score/Coverage drill-down and Remediation workspace. Scan trends are deferred.
6. **Motion:** motion-rich UI approved — route transitions, staggered rows, animated score counts, drawers, toasts — while retaining `prefers-reduced-motion` support, dark-only palette, and no gradients/glow. `DESIGN.md` will be updated to document this motion vocabulary.
7. **Deliverable:** design spec, then implementation plan, then incremental implementation.
8. **Sequencing:** the audit scan/fix track runs in parallel with frontend planning; fixes to our repo land after the rebuild.
9. **Verification:** every slice is checked in a real browser with Playwright MCP; screenshots/video and console/network evidence are saved under `.playwright-mcp/`.

## Goals

- A rebuilt frontend whose tokens, components, and screens match `DESIGN.md`.
- Feature parity with today's screens: dashboard, scans list/detail, findings, report/PDF, rules, audit log, org settings, health.
- Two new evidence-first screens: score/coverage drill-down and remediation workspace.
- Modern affordances: breadcrumbs, toaster, skeletons, empty/error states, drawers, and motion with reduced-motion fallback.
- No changes to orchestrator APIs or contracts.

## Non-goals

- No billing, plans, or commercial flows.
- No managed infrastructure, canary rollout, or real OAuth signup in this slice.
- No scan-trends screen.
- No changes to the external MiroFish repository.

## Architecture

- `apps/web` remains Nuxt 4 with strict TypeScript. A new `app/design-system/` layer holds token CSS variables, primitives, and motion presets.
- A dev-only flag (`NUXT_PUBLIC_NEW_UI`) selects the new shell and screens. The old shell/screens remain until parity, then are deleted along with the flag.
- Data flow is unchanged: browser → existing `/api/v1/*` BFF routes → orchestrator. New screens consume the same endpoints; no backend contract changes.
- Breadcrumbs derive from route metadata. Toasts are driven by action results via a shared composable/store.

## Components

Primitives: Button, Card, Badge, Input, Skeleton, Drawer/Slideover, ScoreCard, FindingRow, FilterChips, EmptyState, ErrorState, Toast, Breadcrumb.

ScoreCard combines the 36 px score, grade, coverage status, and a link to the findings that produced it. It is the signature component and enforces the "score never alone" rule.

## Screens

Existing: dashboard, scans list, scan detail, findings, report/PDF, rules, audit log, org settings, health.

New:
- **Score/Coverage drill-down** — explains section weights, applicable controls, active findings, and coverage gaps.
- **Remediation workspace** — triage queue with status/assignee, remediation guidance, and hashed evidence per finding.

## Motion and interaction

Route fades ~180 ms; staggered finding-row entrances capped at 20 rows; animated score count-up; drawer slide; toast enter/exit; subtle hover lifts. All durations are token-driven CSS values. `prefers-reduced-motion` collapses transitions to near-zero. No gradients, glow, or light theme. Focus rings remain 2 px signal green with 2 px canvas offset.

## Error handling and accessibility

- Reuse the existing `apiError` contract; new screens render explicit empty, loading (skeleton), and error/retry states.
- Exactly one `h1` per page; no skipped heading levels.
- Keyboard-operable filters, drawers, and toasts; `aria-live` for toasts; visible focus rings; axe-core checks in e2e.

## Verification

- Per slice: typecheck, lint, unit tests, Playwright e2e, axe accessibility, bundle-size budget.
- Visible browser checks with Playwright MCP: open each rebuilt screen, assert DOM/network, capture console errors, save screenshots and a short walkthrough video under `.playwright-mcp/`.
- Evidence file `.playwright-mcp/frontend-verification.md` records screen, checks, artifact paths, and result.
- Final regression: full monorepo lint/typecheck/test/build/audit plus a real scan and PDF download.

## Rollout

1. Enable the flag in dev; build the design-system layer.
2. Migrate screens one at a time, each passing its verification gate.
3. Delete the old shell/screens after parity.
4. Remove the flag and update `DESIGN.md` with the final token/motion values.
5. Run the final regression and commit.

## Risks

- Motion-rich UI conflicts with `DESIGN.md`'s original quiet-motion stance; mitigated by updating the document and retaining reduced-motion support.
- Big diff from a full rebuild; mitigated by the strangler approach and per-slice gates.
- Docker/Redis/Postgres must be running for scan-based verification; these are restorable from `docker-compose.yml`.

## Acceptance criteria

- Every listed screen renders from the new design system with no legacy component usage.
- Score/Coverage drill-down and Remediation workspace are reachable from navigation.
- Playwright screenshots/video exist for each screen and the full scan-to-report walkthrough.
- All per-slice and final regression checks exit 0.
- `DESIGN.md` matches the implemented tokens and motion rules; no conflicting "source of truth" line remains.
