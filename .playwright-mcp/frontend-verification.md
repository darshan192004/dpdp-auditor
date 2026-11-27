# Signal Console — final frontend verification

## Environment

Real mode, not fixtures: no `NUXT_FIXTURES`, no feature flag, orchestrator healthy on `:3101`,
web on `:3000` via `pnpm dev`, authenticated dev session bootstrapped with
`POST /api/auth/dev-session` (200). Browser: Playwright MCP Chromium at 1366×900 (desktop) and
375×812 (mobile). All screenshots and logs are under `.playwright-mcp/`.

Live records used below:

| Record | UUID |
|---|---|
| Completed scan | `e4fab596-dfa2-4926-951a-bea92d31701f` |
| Queued scan | `dd8f8cdc-b299-45a1-b7c7-29a877e2278f` |
| Triage finding | `85567a73-5d80-4c81-a982-fff28e294d5e` |
| Repository | `fb290ba7-5225-4efb-802a-839abd773420` |
| Report | `621eb5f6-b7de-4c81-bef4-6331ffeef153` |

## Desktop sweep (1366×900)

Every route was opened in the browser and audited with live DOM assertions: exactly one `h1`,
`document.scrollWidth - innerWidth <= 0`, no `undefined`/`NaN`/`null` visible text, no unnamed
button/link/field, no duplicate element IDs, and **0 new console errors** per route. Screenshots
from the earlier flag-free pass are `.playwright-mcp/redesign-*.png`; the final overview is
`.playwright-mcp/final-desktop-overview.png`.

| Route | `h1` | Overflow | Result |
|---|---|---|---|
| `/` | DPDPA GitHub Code Auditor | 0 | PASS |
| `/app` | Overview | 0 | PASS |
| `/app/scans` | Scans | 0 | PASS |
| `/app/scans/e4fab…01f` | improwised/jovVix | 0 | PASS |
| `/app/scans/e4fab…01f/findings` | Findings | 0 | PASS |
| `/app/scans/e4fab…01f/coverage` | Score and coverage | 0 | PASS |
| `/app/scans/e4fab…01f/remediation` | Remediation workspace | 0 | PASS |
| `/app/remediation` | Remediation | 0 | PASS |
| `/app/rules` | Rules | 0 | PASS |
| `/app/rules/DPDPA-5-NOTICE-01` | Notice | 0 | PASS |
| `/app/audit` | Audit | 0 | PASS |
| `/app/settings/org` | Settings | 0 | PASS |
| `/app/settings/api-keys` | API keys | 0 | PASS |
| `/app/repos` | Repositories | 0 | PASS |
| `/app/repos/fb290…420` | improwised/jovVix | 0 | PASS |
| `/health` | Health | 0 | PASS |
| `/report/621e…153` | Report | 0 | PASS |
| `/app/scans/dd8f…28f` | improwised/jovVix | 0 | PASS |

Overview data rendered from the real API: score `100.0`, grade `A`, 18 scored controls,
10 sections, 33 mappings, 37 open findings.

## Mobile sweep (375×812)

Same assertions on the same 18 routes. Every route returned `h1=1`, `overflow <= 0`, `bad=[]`,
`unnamed=0`, `dup=[]`, `newErrors=0`. Screenshots: `.playwright-mcp/final-mobile-overview.png`,
`final-mobile-nav-drawer.png`, `final-mobile-report.png`, `final-mobile-coverage.png`.

| Route group | Routes | Overflow before → after |
|---|---|---|
| Shell / overview | `/`, `/app`, `/app/scans`, scan detail, findings | 0 → 0 |
| Score + remediation | coverage `115 → -15`, remediation `227 → -15` | fixed |
| Rules / audit / settings | 4 routes | 0 → 0 |
| Repositories | `/app/repos` `175 → 0` | fixed |
| Report | `/report/621e…153` `419 → 0` | fixed |
| Health / queued scan | 2 routes | 0 → 0 |

Mobile navigation: hamburger is 44×44, opens a `role="dialog"` rail, focus lands on
`Close navigation menu`, Escape and the close button both restore focus to the hamburger,
`scrollWidth - innerWidth <= 0`.

## Interaction flows

| Flow | Evidence | Result |
|---|---|---|
| Overview `+ New scan` | links to `/app/scans?new=1`; drawer opens once, query marker stripped; exactly one heading (`Start a scan`) | PASS |
| Start-scan error | real `POST /api/v1/scan` 402 surfaced verbatim: "The free plan allows 5 scans per month." | PASS (UI) |
| Scans status filter | `Queued` reduces 5 rows to 1; `aria-pressed=true` on the active chip | PASS |
| Pagination | API reports `totalItems: 5`, `totalPages: 1`, so controls correctly absent | PASS |
| Findings filter | `scan` reduces 13 audit rows to 2 | PASS |
| Finding drawer | dialog has resolvable `aria-describedby` → "Review the evidence and record a disposition." and a single `Finding` title; missing-description warning gone | PASS |
| Triage error | real `PATCH /api/v1/findings/8556…d5e` 503 surfaced verbatim: "The audit service is unavailable. Try again shortly." | PASS (UI) |
| PDF export | `POST /api/v1/report/pdf` → ready report; `Download PDF` triggered a real download | PASS |
| PDF bytes | HTTP 200, `%PDF-1.3`, `application/pdf`, 33,752 bytes, SHA-256 `4311f9183d0bac2e0aa630579346231b052936f708ae26bab415544bccf14b01` | PASS |

## Motion and accessibility

- `prefers-reduced-motion: reduce`: `.ds-skeleton::after` computes `animationName: none`;
  `.page-enter-active` computes `transitionDuration: 1e-05s`.
- Normal motion: `.ds-skeleton::after` computes `skeleton-shimmer 1.4s`.
- Route crossfade observed via MutationObserver:
  `page-leave-from page-leave-active` → `page-leave-active page-leave-to` →
  `page-enter-active page-enter-to`.
- Pluralization corrected (`1 control`, not `1 controls`).
- Console across the final pass: **0 errors, 45 warnings**. Warnings are known dev-only
  Nuxt/Vue notices (`NUXT_E4007`, duplicate `requireIdentity` import, `NUXT_B8014`,
  `nostics import.meta.hot.send`) plus the `lint-tokens` fixture's "1 raw hex colour".

## Gates (final)

| Gate | Result |
|---|---|
| `pnpm lint` | exit 0 — ESLint, Prettier, token lint all clean |
| `pnpm --filter @dpdpa/web typecheck` | exit 0 |
| `pnpm --filter @dpdpa/web test` | 55 files / 443 tests passed |
| `pnpm --filter @dpdpa/web build` | exit 0 |
| `pnpm audit --prod` | exit 0 — 3 moderate advisories ignored via existing `pnpm.auditConfig.ignoreGhsas` |

## Environment limitations (not frontend defects)

- Scan creation is rejected by the backend with 402 (free-plan quota). The UI now shows the
  server's real reason; backend contracts were deliberately left unchanged because the MVP has
  no plans/billing.
- Finding triage persistence is rejected by the backend with 503 (audit service unavailable).
  The UI surfaces the real reason instead of a generic toast.
- Docker daemon is down while the orchestrator uses `RUNNER_DRIVER=docker`, so the queued scan
  `dd8f…28f` cannot advance; live progress stages cannot be observed end-to-end here.
- These are infrastructure/backend constraints of this local environment. No frontend code
  path is known to be broken by them.

## Post-final deeper audit (issue-linked fixes)

A deeper keyboard/validation pass on the real stack found four defects that the earlier route sweep
did not cover. Each was filed separately and is fixed on its own branch against
`feat/e2e-fullstack-verification`.

| Issue | Finding | Fix | PR |
|---|---|---|---|
| [#85](https://github.com/darshan192004/dpdp-auditor/issues/85) | Triage disposition offered two indistinguishable `Reopen` options | `open` is now **Leave open** for an open finding and **Mark open** for a closed finding; `reopened` stays **Reopen** | [#89](https://github.com/darshan192004/dpdp-auditor/pull/89) |
| [#86](https://github.com/darshan192004/dpdp-auditor/issues/86) | Create API key dialog declared `aria-modal` but did not move/trap/restore focus, handle Escape, or expose a close control | Focus moves to the dialog heading, Tab wraps at both ends, Escape and the new close button restore focus to the trigger | [#90](https://github.com/darshan192004/dpdp-auditor/pull/90) |
| [#87](https://github.com/darshan192004/dpdp-auditor/issues/87) | Empty scan submission showed the raw contract message in a page-level alert with no field association or focus move | Plain-language inline error on the URL/repository fields with `aria-invalid`, `aria-describedby`, focus move, and clear-on-edit | [#91](https://github.com/darshan192004/dpdp-auditor/pull/91) |
| [#88](https://github.com/darshan192004/dpdp-auditor/issues/88) | Invalid repository URL was sent to `/api/v1/repos/resolve`, returning a 422 page-level alert only | Shared validator rejects non-GitHub URLs locally; inline field error with ARIA wiring and focus; resolver is not called | [#92](https://github.com/darshan192004/dpdp-auditor/pull/92) |

### #85 evidence

- Before: option labels `["Reopen","Mark false positive","Accept risk","Mark fixed","Reopen"]`
  with values `["open","false_positive","accepted_risk","fixed","reopened"]`.
- After: `["Leave open","Mark false positive","Accept risk","Mark fixed","Reopen"]`, all unique.
- Screenshots: `.playwright-mcp/issue-triage-duplicate-reopen.png`,
  `.playwright-mcp/issue-triage-duplicate-reopen-fixed.png`.
- Regression test `apps/web/test/triage-form.test.ts` was RED (3 failures) before the fix and
  GREEN (3 passed) after.

### #86 evidence

- Before: focus stayed on the trigger; no close button; Tab escaped to `BODY`; Escape left the
  dialog open.
- After browser check: on open, `activeTag=H2`, `activeId=create-key-heading`,
  `insideDialog=true`, close button present. Escape and the close button both close the dialog and
  return focus to `Create API key`.
- Browser Tab check: Shift+Tab from the heading wraps to **Cancel** (`defaultPrevented=true`);
  Tab from **Cancel** wraps back to the heading (`defaultPrevented=true`).
- Screenshots/snapshots: `.playwright-mcp/issue-api-key-modal-focus.png/.yml` (before),
  `.playwright-mcp/issue-api-key-modal-focus-fixed.png/.yml` (after).
- Regression test `apps/web/test/api-key-dialog.test.ts` was RED (4 failures) before the fix and
  GREEN (4 passed) after.
- Full gates on the fix branch: 56 files / 447 tests, typecheck, lint, build.

### #87 evidence

- Before: empty submit showed `Provide exactly one of repositoryId or githubUrl.` in a generic
  page-level alert, with no `aria-invalid`, no `aria-describedby`, and no focus move.
- After browser check: one `role="alert"` with `id="scan-source-error"` and plain-language copy;
  both `#scan-url` and `#scan-repo` have `aria-invalid="true"` and reference the error; focus is on
  `#scan-url`. Typing a valid URL removes the alert and both invalid states, leaving only
  `aria-describedby="scan-url-help"`.
- Evidence: `.playwright-mcp/issue-scan-empty-feedback-fixed.png/.yml`.
- Regression test `apps/web/test/scan-submit-form.test.ts` was RED (6 failures) before the fix and
  GREEN (13 tests in the file) after.
- Full gates on the fix branch: 55 files / 449 tests, typecheck, lint, build.

### #88 evidence

- Before: a GitLab URL produced a console error
  `422 (Enter a valid GitHub repository URL.) @ /api/v1/repos/resolve` and only a page-level alert;
  the URL field had no error state.
- After browser check: the same input produces no resolver call, no console errors, and only the
  inline `#repo-url-error` alert. The input has `aria-invalid="true"` and
  `aria-describedby="repo-url-help repo-url-error"`, focus is on `#repo-url`, and no page-level
  alert is shown. Correcting the URL clears all error state.
- Evidence: `.playwright-mcp/issue-repos-invalid-url-fixed.png/.yml`.
- Regression tests were RED (8 failures across `github-url.allowlist.test.ts` and the new
  `repos-connect-form.test.ts`) before the fix and GREEN (18 tests) after.
- Full gates on the fix branch: 56 files / 453 tests, typecheck, lint, build.

### Main integration

- Fixes #85–#88 were cherry-picked from the merged feature branch onto a fresh branch based on
  `origin/main` at `7ee94d3`; PRs #89–#92 had already merged into
  `feat/e2e-fullstack-verification` after PR #84 merged, so `main` lacked them.
- One conflict in `ScanSubmitForm.vue` was reconciled to keep both the inline validation/focus fix
  and `main`'s `submitRequest` error handling and submitting-state guard.
- Gates on the `main`-based branch: `pnpm lint`, web typecheck, web build, and 77 files / 571 web
  tests passing. A stale local `@dpdpa/contracts` build artifact was rebuilt before typecheck.

### PR #116 review follow-ups

- CodeRabbit's two inline findings were verified against the current dialog code. Escape, the close
  button, and backdrop click called `closeCreateDialog()` directly, so a successful POST could store
  a one-time key in a closed dialog; all dismissals now go through a `pending`-guarded wrapper.
  `Shift+Tab` from the close button could leave the dialog because the backward boundary was the
  programmatically focused heading (`tabindex="-1"`); the first sequential control is now also a
  boundary. Four new regression tests were RED before the fix and GREEN after (8 total in
  `apps/web/test/api-key-dialog.test.ts`).
- CodeRabbit's retained compatibility concern was verified: the shared GitHub URL pattern was
  case-sensitive, so mixed-case hostnames that previously passed `shared/repo.ts` validation were
  rejected. Added a RED-to-GREEN regression test in `apps/web/test/github-url.allowlist.test.ts`
  and made the pattern case-insensitive.
- PR-Agent's ticket note on #85 was checked against the issue text. The issue accepts unique,
  action-oriented labels **or** omitting the no-op option; the fix takes the first alternative, with
  `Mark open` / `Leave open` and distinct labels for every other status. No change needed.

## Verdict

**MVP-ready.** The rebuilt Signal Console renders every route end-to-end in real mode, all
interaction flows behave correctly (including honest surfacing of backend failures), desktop
and mobile layouts have no overflow or accessibility regressions, motion honors
`prefers-reduced-motion`, and all quality gates pass. The deeper keyboard/validation audit added
four issue-linked fixes (#85–#88, PRs #89–#92), each with failing-first regression tests and
browser evidence. The remaining blockers are backend quota, backend availability, and Docker
availability in this environment — none are frontend work.
