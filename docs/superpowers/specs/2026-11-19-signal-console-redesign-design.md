# Signal Console dashboard redesign design

**Date:** 2026-11-19
**Status:** Approved for implementation planning
**Scope:** Rebuild the `apps/web` view layer into a reference-driven dashboard while keeping the tested foundation, and restore all core flows dropped by the flag-free rebuild (`3e281ad`).

## Context

The flag-free rebuild (`3e281ad`, PR #84) made every page render only the `New*` components. Those components are thin placeholders: `NewOverview.vue` is 17 lines of four static cards, `NewScansList.vue` is a list of links, and page wrappers pass only minimal props. The UI therefore reads as unfinished even though the BFF API, shared types, auth, and DS primitives are correct and tested (49 files / 422 web tests).

A concrete regression was confirmed against `origin/main`: the rebuilt Scans page no longer imports or renders `ScanSubmitForm`, so the app has **no way to start a scan from the UI**. Filters/pagination, full finding triage, and other interactions were likewise lost when the rich `origin/main` pages were replaced by thin wrappers.

The user approved a full visual/functional overhaul and selected all four scopes: visual quality, missing functionality, animations/feel, and a reference-driven redesign. A browser visual companion was used to compare three directions grounded in current Vercel Security, Linear, CodeAnt, Drata/Safeguard, ScanOSS and Pencheff dashboard patterns. The user selected the **A+B+C hybrid**. They then approved: all core flows restored, "rebuild the view layer, keep the foundation" (Approach 3), and all three design sections (architecture, screen layouts, data/errors/verification).

## Decisions

1. **Direction — A+B+C hybrid by screen:** B (Compliance Posture) for Overview; C (Engineering Console) for Scans and Audit lists; A (Security Console) for scan detail and Findings. Rest of the app follows the same visual system.
2. **Approach 3 — keep the foundation, rebuild the view layer.** Shell/routing, `server/api/v1/**`, composables, `shared/`, auth/session, tokens (`main.css`), and DS primitives stay. The 12 `New*` components are replaced; page wrappers regain their missing interactions.
3. **All core flows restored:** start scan, scan filters/pagination, cancel, findings filter/sort/pagination and triage, coverage drilldown, remediation workspace, PDF report download, rules, audit, org settings, API keys, invites.
4. **Port, don't reinvent:** reuse existing `ScanSubmitForm`, `FindingDrawer`, `FindingsTable`, `TriageForm`, `FindingsFilterBar`, `useFindingsQuery`, `DownloadButton` and their tests, adapting them into the new visual language. No backend or API contract changes.
5. **New shared components live in `components/dashboard/`**, each with one purpose, typed props, and its own test.
6. **No new runtime dependencies.** Sparklines/trends are CSS/SVG, not a chart library. No new network calls outside existing BFF endpoints.
7. **Motion:** keep route transitions, score-rise and the global `prefers-reduced-motion` override; add a scanning spinner + stage pulse, skeleton shimmer, staggered row reveal, and drawer/toast polish.
8. **Verification is browser-visible:** every slice is checked with Playwright MCP so the user can watch; screenshots/video under `.playwright-mcp/`. Final MVP verdict only after real end-to-end flows pass.
9. **Sequence:** spec → implementation plan → incremental implementation with tests → gates → visible MCP walkthrough.

## Goals

- Overview, Scans, scan detail and Findings look like shipped dashboards, not placeholder cards.
- Every core flow works end to end from the UI, including starting a real scan.
- Motion feels alive while respecting reduced-motion.
- Existing 422-test suite and all quality gates remain green; bundle does not regress materially.
- No changes to orchestrator APIs, contracts, or infrastructure.

## Non-goals

- No billing, plans, trials, or commercial flows (open-source MVP only).
- No managed infrastructure, Docker/Kubernetes work, or runner changes.
- No new chart library, design-system overhaul, or token rewrite beyond small additions for new components.
- No scan-trends persistence, assignment persistence, or changes to external scan targets.

## Architecture

- `apps/web` remains Nuxt 4 with strict TypeScript. Page wrappers in `app/pages/**` stay thin: they fetch typed data through existing `/api/v1/*` BFF routes, own mutations, and pass typed props to dashboard components.
- `app/components/new/*` are replaced by richer screens; wrappers are updated to supply the data those screens need. Reused legacy components (`ScanSubmitForm`, findings components) keep their existing interfaces.
- New `app/components/dashboard/*` layer: `ScoreRing`, `SeverityBar`, `SectionCoverageGrid`, `FixFirstList`, `ScanTable`, `TrendSparkline`, `StatusChip`, `DashboardPageHeader`. Each is independently testable and uses existing DS primitives/tokens.
- Data flow unchanged: browser → `/api/v1/**` BFF → orchestrator. Running scans continue to poll via `useScanPolling` only while active.

## Components

- **ScoreRing** — score + grade + coverage together; enforces "score never alone".
- **SeverityBar** — critical/high/medium/low/info distribution from finding counts.
- **SectionCoverageGrid** — DPDP §3–§8 readiness states and mapped-control counts.
- **FixFirstList** — ranked top findings with severity, file, control and one-line remediation.
- **ScanTable** — dense rows with status chips, score/grade, duration, when, filters, pagination, and a `+ New scan` action.
- **TrendSparkline** — pure CSS/SVG score trend; omitted when history is unavailable.
- **StatusChip**, **DashboardPageHeader** — shared status language and page header with actions/breadcrumbs.
- Reused: `DsCard`, `DsButton`, `DsDrawer`, `DsToastHost`, `DsSkeleton`, `DsEmptyState`, `DsErrorState`, `DsBadge`, `DsFilterChips`, `DsFindingRow`, `DsScoreCard`, `ScanSubmitForm`, `FindingDrawer`, `FindingsTable`, `FindingsFilterBar`, `TriageForm`, `DownloadButton`.

## Screens

- **Overview (B):** context header + New scan CTA; KPI row (score ring/grade, open findings, section coverage, scanner health from the existing `/health` endpoint); section readiness grid; control coverage bars; recent scans table; Fix-these-first list.
- **Scans (C):** filterable, searchable, paginated scan table with `+ New scan` drawer using the restored `ScanSubmitForm`; row → detail.
- **Scan detail (A):** sticky summary (score ring, grade, coverage, status); animated stage rail with spinner/elapsed clock for running scans; findings ranked list; coverage/remediation/report tabs; cancel with confirm; PDF download with evidence hash.
- **Findings (A):** severity chips, search, sort, pagination; drawer with evidence hash and remediation summary; working triage via existing form; reduced-motion-safe row reveal.
- **Remediation:** triage queue and workspace with real status changes.
- **Rules:** section nav, control cards, mapping table, search.
- **Audit:** dense, filterable, paginated event table.
- **Settings / API keys / Invites / Report / Health:** same visual system; existing behavior preserved.

## Data flow & error handling

- All reads via existing BFF routes with typed responses; all writes via `$fetch` with success/error toasts and a refetch on success. No optimistic writes that could misrepresent server state.
- Every screen has loading skeleton, empty state, and error state including API `requestId` where available.
- Write failures surface inline and as toasts; 401 redirects to login via existing logic. No silent failures.
- The queued real jovVix scan (`dd8f8cdc-b299-45a1-b7c7-29a877e2278f`) is used for live-progress verification once a runner is available; until then it stays `queued` and is not represented as completed.

## Motion

- Tokens already exist in `main.css` (`--motion-fast/base/slow`, `--ease-out`) and are reused.
- Route transitions, score-rise, drawer/toast motion and skeleton shimmer use those tokens; new scanning spinner and stage pulse are CSS animations.
- Staggered row reveal uses bounded `transition-delay` capped at ~20 rows to avoid long tails.
- The global `@media (prefers-reduced-motion: reduce)` override remains and is verified live in the browser.

## Verification

1. Unit tests for every new dashboard component; existing tests kept green and updated for restored behaviors.
2. Full gates: `pnpm lint`, typecheck, test (422 suite), build, security audit.
3. Visible Playwright MCP walkthrough (user watching) across all 18 screens/interactions with 0 console errors.
4. Real flows in the browser: Start scan → appears in list → detail progress (using the queued jovVix scan or another running scan); findings → triage → PDF download (using an existing completed real scan such as `e4fab596-dfa2-4926-951a-bea92d31701f`); plus cancel, rules, audit, settings, API keys, invites.
5. Screenshots/video saved under `.playwright-mcp/`; reduced-motion checked live; final MVP verdict reported explicitly.

## Risks & mitigations

- **Regression from replacing views:** mitigate by porting tested components and running the full gate suite after each slice, not only at the end.
- **Visual drift without backend data for some KPIs:** derive KPIs from existing catalog/scan/findings endpoints; omit trend/history visuals where the API has no data rather than fabricating values.
- **Real scan blocked by runner availability:** keep the queued scan honest; verify UI progress handling with the existing scan polling contract and complete the real scan when the runner is available. Do not claim MVP-ready until end-to-end flows pass.
