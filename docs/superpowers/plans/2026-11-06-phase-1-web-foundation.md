# Phase 1 Web Foundation Implementation Plan

> **Status (2026-11-10):** Tasks 1-7 (P1-22…P1-30) complete and merged. Backend foundation plan complete: P1-11 (#27), P1-15 (#29), P1-26 (#30), P1-27 (#31) are on `main` at `ec5bc5a` — **P1-26/P1-27 are no longer blocked**. Keep this file in the repo as the cross-machine source of truth; mirror checkbox updates here when tasks land.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the frontend foundation of the DPDPA auditor web app — Nuxt 4 scaffold with strict TS and design tokens, security headers, app shell layouts, health surface, route-access state, and a Playwright harness — each landed as its own gated PR.

**Architecture:** One Nuxt 4 app at `apps/web` inside the existing pnpm + Turborepo workspace. Server code lives in `apps/web/server/` (Nitro), client in `apps/web/app/`, shared pure logic in `app/utils/` so it is unit-testable without mounting Nuxt. Every task is TDD'd with Vitest (`@nuxt/test-utils`) except the token-lint script (fixture tests) and the header test (live server fetch).

**Tech Stack:** Nuxt 4.6.4, Vue 3.5, TypeScript (root 6.0.3, strict flags), Nuxt UI 3.3.7, Tailwind CSS 4 (via `@nuxt/ui`), `nuxt-security` 2.7.0, Vitest 5 + `@nuxt/test-utils` 4.3.4, Playwright 1.65.0, ESLint 9 flat config + `eslint-plugin-vue`, Prettier + `prettier-plugin-vue` + `prettier-plugin-tailwindcss`.

**Spec:** `docs/design.md` (visual/UX authority), `docs/code_style.md` §5 (Nuxt structure, SFC rules, test strategy), `docs/security.md` §8 (nuxt-security contract), `docs/tasks.md` §4.3 (P1-22…P1-30), `docs/memory.md` §4/§19/§20 (stack pins, naming, UI state rules).

## Global Constraints

- Spec pins win over anything else: **Nuxt UI 3** (3.3.7 — NOT 4.x), `nuxt-security@^2` (2.7.0), Nuxt 4, Vue 3.5, Tailwind CSS 4, Node 22, pnpm 9.15.9.
- TypeScript: root `tsconfig.base.json` strict flags apply to `apps/web` too — `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`.
- Design tokens are **verbatim** from `docs/design.md` §6 into `apps/web/app/assets/css/main.css` (`@import "tailwindcss"; @import "@nuxt/ui";` then `@theme { … }`). Slate-and-teal only; no purple, no gradients, no hero cards.
- **No raw hex outside the token file** (design.md §15 DoD). No arbitrary px values; 4px spacing scale; radius: controls 6px, cards 10px, badges pill.
- Copy per `docs/design.md` §13: direct, calm, never claims legal compliance; button labels are verbs.
- Naming per `docs/memory.md` §19: components PascalCase, pages kebab-case/[param], composables `useX`, server routes `method.suffix.ts`, branches `feat/…`.
- Structure per `docs/code_style.md` §5.1: `app/` client, `server/` Nitro, never cross-import; auto-imports used, no manual Vue/Nuxt API imports; `import type` for types.
- Lint gate stays `eslint . --max-warnings 0 && prettier --check .` at root and must stay green with `.vue` files added.
- Performance budget: initial JS for `/app` < **180,435 B gzipped** (`budgets.json` `webAppGzipBytes`).
- One branch → one PR → all 5 required checks green + PR-Agent applied/rejected-with-reason + CodeScene `analyze_change_set` + five-axis review → merge (`--merge --delete-branch`). Never waive a gate.
- Local-only: no cloud accounts; Docker not required for these tasks.

## Review Focus

1. **Bundle budget blowout** — Nuxt UI + Tailwind can silently ship >180 KB gzip. P1-22 gets a step that measures gzipped client JS after `nuxt build` and reports it in the PR; if over budget, trim (drop unused Nuxt UI features/modules) before merge. (Owning task: Task 1.)
2. **CSP violations at runtime** — nonce-based CSP can break Nuxt UI inline styles/scripts. P1-23's test asserts the CSP header contains `nonce-` and `'strict-dynamic'` with `'unsafe-inline'` only for `style-src` (per security.md §8); P1-30 smoke test asserts zero CSP errors in the browser console. (Owning tasks: Task 4, Task 7.)
3. **TypeScript 6 vs. Vue toolchain peers** — `@nuxt/ui` declares peer `typescript ^5.6.3`; root is 6.0.3, and `vue-tsc` must run under it. Task 1 verification runs `pnpm typecheck` at root; if `vue-tsc` fails on TS 6, record the failure in the ledger and pin `typescript` for `apps/web` only (`~5.9`) with a Renovate-style note — do not weaken root TS. (Owning task: Task 1.)
4. **Redirect loops / wrong exemptions in route middleware** — `auth` middleware must never redirect `/login`, `/onboarding`, `/health`, or public routes, and must carry `?redirect=` for `/app/**`. Task 6 tests the pure resolver across those exact cases before the middleware wraps it. (Owning task: Task 6.)
5. **Raw hex creeping into components** — the lint script must catch hex in `.vue`/`.ts`/`.css` under `apps/web` while exempting `app/assets/css/main.css`, and must not false-positive on `#main`-style fragments. Task 2 tests both directions with fixtures. (Owning task: Task 2.)

---

### Task 1: P1-22 — Nuxt 4 app init, strict TS, Nuxt UI 3, tokens

**Files:**
- Create: `apps/web/package.json`, `apps/web/nuxt.config.ts`, `apps/web/tsconfig.json`, `apps/web/vitest.config.ts`
- Create: `apps/web/app/app.vue`, `apps/web/app/pages/index.vue`, `apps/web/app/assets/css/main.css`
- Create: `apps/web/test/tokens.test.ts`, `apps/web/test/index.test.ts`
- Modify: `eslint.config.js` (via `packages/config/eslint.config.cjs`): add `eslint-plugin-vue` flat config for `**/*.vue`, ignore `**/.nuxt/**`, `**/.output/**`
- Modify: `.prettierrc` (add plugins `prettier-plugin-vue`, `prettier-plugin-tailwindcss`), `.prettierignore` (add `.nuxt/`, `.output/`), `lint-staged.config.js` (add `*.vue`)
- Modify: `turbo.json` (build outputs add `.output/**`), root `package.json` (devDeps: `eslint-plugin-vue`, `prettier-plugin-vue`, `prettier-plugin-tailwindcss`)

**Interfaces:**
- Consumes: workspace globs `apps/*` (pnpm-workspace.yaml), root `tsconfig.base.json`, root lint scripts.
- Produces: package `@dpdpa/web` with scripts `dev`, `build` (`nuxt build`), `preview`, `typecheck` (`nuxt typecheck`), `test` (`vitest run`), `test:coverage` (`vitest run --coverage`); token file at `app/assets/css/main.css` (all later tasks import it via `nuxt.config` `css: ['~/assets/css/main.css']`); landing page at `/`.

- [x] **Step 1: Write the failing token test**

`apps/web/test/tokens.test.ts` — reads `../app/assets/css/main.css` and asserts (table-driven):

```ts
const REQUIRED_TOKENS: Record<string, string> = {
  '--color-brand-600': '#0d9488',
  '--color-brand-700': '#0f766e',
  '--color-ink-50': '#f8fafc',
  '--color-ink-900': '#0f172a',
  '--color-risk-critical-solid': '#dc2626',
  '--color-risk-high-solid': '#ea580c',
  '--color-status-compliant-text': '#166534',
  '--color-confidence-inferred-text': '#92400e',
  '--radius-control': '0.375rem',
  '--radius-card': '0.625rem',
  '--shadow-card': '0 1px 2px 0 rgb(15 23 42 / 0.04)',
  '--font-sans': '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  '--font-mono': '"JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, monospace',
};
// assert file contains `@import "tailwindcss";` and `@import "@nuxt/ui";`
// assert every key: value pair above appears literally; assert no `purple`/`gradient` token
```

Also `apps/web/test/index.test.ts`: `mountSuspended` of the landing page asserts exactly one `h1` whose text matches design §13 tone (product name, no "AI-powered"/"seamless" words).

- [x] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @dpdpa/web test`
Expected: FAIL — file/module not found (app not scaffolded yet).

- [x] **Step 3: Scaffold the app**

- `apps/web/package.json`: name `@dpdpa/web`, private, scripts as in Interfaces; devDeps: `nuxt@4.6.4`, `@nuxt/ui@3.3.7`, `vue-tsc`, `@nuxt/test-utils@4.3.4`, `vitest` (workspace root has it), `@vue/test-utils`.
- `pnpm install` — then check `git status pnpm-lock.yaml` (lockfile must be staged with the change).
- `nuxt.config.ts`: `modules: ['@nuxt/ui']`, `css: ['~/assets/css/main.css']`, `typescript: { strict: true }`, `devtools: { enabled: false }`.
- `app/assets/css/main.css`: copy the §6 `@theme` block **verbatim** (brand, ink, risk, status, confidence, fonts, radii, shadows).
- `app/app.vue`: `<NuxtLoadingIndicator />` + `<NuxtLayout><NuxtPage /></NuxtLayout>` (layouts come in Task 3; default layout renders `<slot />` — create `app/layouts/default.vue` with just `<slot />` now so the app renders).
- `app/pages/index.vue`: minimal landing — `h1` with product name "DPDPA GitHub Code Auditor", one-sentence description per §13, one primary action link to `/app` (placeholder). Use semantic classes from §6.1 (`bg-ink-50`, `text-ink-800`, `bg-brand-700`).
- `vitest.config.ts`: `defineVitestConfig` from `@nuxt/test-utils/config` with `test: { environment: 'nuxt' }`.

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @dpdpa/web test`
Expected: PASS (token assertions + landing render).

- [x] **Step 5: Wire lint/format for Vue**

- `packages/config/eslint.config.cjs`: add `const vue = require('eslint-plugin-vue')`, spread `vue.configs['flat/recommended']` for `files: ['**/*.vue']` with `parserOptions.parser` set to `@typescript-eslint/parser` for `<script lang="ts">`; add `'**/.nuxt/**'`, `'**/.output/**'` to ignores.
- `.prettierignore`: add `.nuxt/` and `.output/`.
- `.prettierrc`: `"plugins": ["prettier-plugin-vue", "prettier-plugin-tailwindcss"]` (verify plugin load order makes `prettier --check` pass on a `.vue` file; if `prettier-plugin-vue` errors on Prettier 3.9, ledger it and use `@vue/prettier` equivalent — do not drop the Tailwind plugin, code_style.md §5 mandates class ordering).
- `lint-staged.config.js`: first glob becomes `'*.{ts,mts,cts,js,mjs,cjs,vue}'`.
- Run: `pnpm lint` → must be green (eslint parses `.vue`, prettier checks it).

- [x] **Step 6: Strict-TS + full gate + budget measurement**

Run: `set -o pipefail; pnpm lint && pnpm typecheck && pnpm exec turbo test --force && pnpm build`
Expected: all green (this exercises Review Focus 3 — `vue-tsc` under TS 6; on failure apply the pinned contingency from Review Focus 3 and note it in the PR).
Then measure: `find apps/web/.output/public/_nuxt -name '*.js' -exec gzip -c {} \; | wc -c` → record the number in the PR description; must be < 180435 (Review Focus 1).

- [x] **Step 7: Commit → PR → gates → merge**

Branch `feat/P1-22-nuxt-app`. Conventional commit `feat(web): scaffold Nuxt 4 app with strict TS, Nuxt UI 3, and design tokens`. Push → `gh pr create` → confirm 5 checks attach to head → CodeScene `analyze_change_set` (main repo path) → five-axis review → read PR-Agent `opened` run → apply/reject suggestions with reason → `task-done` → merge `--merge --delete-branch` → checkout main, pull, `git branch -d`, `git fetch --prune`.

---

### Task 2: P1-25 — token-only lint rule (no raw hex outside the token file)

**Files:**
- Create: `apps/web/scripts/lint-tokens.mjs`, `apps/web/test/lint-tokens.test.ts`
- Modify: root `package.json` (`lint` script), `docs`-adjacent nothing else

**Interfaces:**
- Consumes: token file path `app/assets/css/main.css` from Task 1.
- Produces: `scanForRawHex(entries: Array<{ path: string; content: string }>, exemptPath: string): Array<{ path: string; line: number }>` exported from `lint-tokens.mjs`; CLI exit 1 with a printed file:line list when violations exist; root `pnpm lint` runs it after prettier.

- [x] **Step 1: Write the failing tests**

`apps/web/test/lint-tokens.test.ts` (fixture-driven, no filesystem writes needed if `scanForRawHex` takes content entries):
- detects `#0d9488` in a `.vue` template and in a `<style>` block → reports path+line
- detects `#fff` in a non-exempt `.css` file
- does NOT report `#0d9488` when `path` is `app/assets/css/main.css` (exempt)
- does NOT report `href="#main"` or `id="main"` (regex must require 3/4/6/8 hex digits followed by a non-hex boundary — `#main` fails because `m`/`i`/`n` are not all hex... `#abc`-style fragments of exactly 3 hex chars WILL match; acceptable — test pins `#main` no-match, and `#feed` false-positive is documented as acceptable in the script header comment)
- CLI smoke: running the script with a temp dir containing one violation exits 1 and prints `path:line`

- [x] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @dpdpa/web test -- lint-tokens`
Expected: FAIL — module not found.

- [x] **Step 3: Implement `lint-tokens.mjs`**

Walk `apps/web` recursively (skip `node_modules`, `.nuxt`, `.output`, `test`, `scripts`), scan extensions `.vue .ts .css .html` with `/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g`, exempt `app/assets/css/main.css`, print `relative/path:line` per hit, `process.exitCode = 1` on any hit. Export `scanForRawHex` for the tests; CLI entry guarded by `import.meta.url === pathToFileURL(process.argv[1]).href`.

- [x] **Step 4: Run tests to verify they pass, then wire into root lint**

Run: `pnpm --filter @dpdpa/web test -- lint-tokens` → PASS.
Root `package.json`: `"lint": "eslint . --max-warnings 0 && prettier --check . && node apps/web/scripts/lint-tokens.mjs"`.
Run: `pnpm lint` → green (current repo has no violations — if Task 1 or later code introduced one, fix the code, never the rule).

- [x] **Step 5: Commit → PR → gates → merge**

Branch `feat/P1-25-token-lint`; commit `feat(web): enforce token-only hex colors with lint script`. Same full gate chain as Task 1 Step 7.

---

### Task 3: P1-24 — layouts, app shell, skip link

**Files:**
- Create: `apps/web/app/layouts/default.vue`, `auth.vue`, `app.vue`, `print.vue`
- Create: `apps/web/app/components/shell/AppTopbar.vue`, `AppSidebar.vue`, `PageHeader.vue`
- Create: `apps/web/app/utils/nav.ts`
- Create: `apps/web/app/pages/app/index.vue` + placeholder pages `app/repos/index.vue`, `app/scans/index.vue`, `app/rules/index.vue`, `app/audit/index.vue`, `app/settings/org/index.vue` (each: `definePageMeta({ layout: 'app' })`, `PageHeader`, one line of §13 copy — prevents dead sidebar links until Phase 5)
- Create: `apps/web/test/app-layout.test.ts`

**Interfaces:**
- Consumes: default layout stub + landing page from Task 1.
- Produces: layouts `default | auth | app | print` (selectable via `definePageMeta({ layout })`); `nav.ts` exports `APP_NAV: Array<{ label: string; to: string; icon: string }>` with exactly `Overview /app`, `Repositories /app/repos`, `Scans /app/scans`, `Rules /app/rules`, `Audit /app/audit`, `Settings /app/settings/org` (design §3.1); `PageHeader` props `{ title: string; breadcrumbs?: Array<{ label: string; to?: string }>; actions?: Slot }`.

- [x] **Step 1: Write the failing layout tests**

`apps/web/test/app-layout.test.ts` via `mountSuspended` on a test page using layout `app`:
- first focusable element is `<a href="#main">Skip to content</a>` (assert it is the first `a`/`button` in DOM order)
- landmarks present: `header`, `nav`, `main` (with `id="main"`), `aside`
- sidebar renders all 6 `APP_NAV` labels as links
- topbar contains an org-switcher placeholder (button with accessible name containing the org placeholder) and an account-menu placeholder button
- exactly one `h1` on the page (from `PageHeader`)
- layout at `print` renders no `header`/`aside` chrome (assert absence)

- [x] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @dpdpa/web test -- app-layout`
Expected: FAIL — layouts/components missing.

- [x] **Step 3: Implement shell**

- `layouts/app.vue`: skip link first (`class="sr-only focus:not-sr-only ..."` per §9), `<AppTopbar />` (56px, `h-14`, `border-b border-ink-200`, contains org switcher placeholder + `⌘K` command-palette trigger placeholder + account menu placeholder — all native `<button>`s with accessible names), grid with `<AppSidebar />` (240px `w-60`, `hidden lg:flex`, off-canvas drawer button with `aria-expanded` below 1024px — implement drawer as simple `<details>`/toggle state, no Nuxt UI dependency required yet), `<main id="main" tabindex="-1">` with `<slot />`, content wrapper `max-w-[1280px] px-6` (max-width/gutters per §3.1; `px-6` = 24px on the 4px scale).
- `layouts/default.vue`: skip link + `<slot />` (landing).
- `layouts/auth.vue`: minimal logo + "Back to site" link + `<slot />` (split layout content comes with Phase 2 auth pages).
- `layouts/print.vue`: `<slot />` only, A4 column `w-[210mm] mx-auto p-[18mm]` (the one sanctioned arbitrary value — print geometry, document it in a comment).
- All layouts wrapped in `<NuxtLayout>` usage already set in `app.vue` from Task 1.
- Styling strictly from §6.1 semantic classes; focus ring class per §6.1.

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @dpdpa/web test` → all green (Tasks 1–3 tests together).

- [x] **Step 5: Full gate + screenshot**

`set -o pipefail; pnpm lint && pnpm typecheck && pnpm exec turbo test --force && pnpm build` → green.
Run `pnpm --filter @dpdpa/web preview` + screenshot the shell at 1440px and 375px (Playwright script or devtools) → attach to PR (design §15 DoD requires a screenshot).

- [x] **Step 6: Commit → PR → gates → merge**

Branch `feat/P1-24-app-shell`; commit `feat(web): app shell layouts with skip link and sidebar navigation`. Full gate chain.

---

### Task 4: P1-23 — nuxt-security configuration per security.md §8

**Files:**
- Create: `apps/web/test/security-headers.test.ts`
- Modify: `apps/web/nuxt.config.ts` (add `nuxt-security` module + `security` block + `runtimeConfig`)

**Interfaces:**
- Consumes: running app from Task 1.
- Produces: response headers on every page response (verified live); `runtimeConfig` keys `orchestratorUrl`, `orchestratorHmacKey`, `sessionPassword` (server) and `public.appUrl` (ready for P1-26; values from env, no secrets in repo).

- [x] **Step 1: Write the failing header test**

`apps/web/test/security-headers.test.ts` using `@nuxt/test-utils` `startServer()` + global `fetch('/login', { redirect: 'manual' })` (any route; use `/` since `/login` page does not exist yet):
- `strict-transport-security` === `max-age=31536000; includeSubDomains; preload`
- `x-frame-options` === `DENY`
- `x-content-type-options` === `nosniff`
- `referrer-policy` === `strict-origin-when-cross-origin`
- `cross-origin-opener-policy` === `same-origin`
- `permissions-policy` contains `camera=()` and `geolocation=()`
- `content-security-policy` contains `default-src 'self'`, `nonce-`, `'strict-dynamic'`, `frame-ancestors 'none'`, and `style-src` includes `'unsafe-inline'` but `script-src` does NOT
- after server: `closeAll()` in `afterAll`.

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dpdpa/web test -- security-headers`
Expected: FAIL — headers absent (no module yet).

- [x] **Step 3: Add `nuxt-security@2.7.0` + config verbatim from security.md §8**

`pnpm --filter @dpdpa/web add nuxt-security@2.7.0` (check lockfile in `git status`). In `nuxt.config.ts` add module `'nuxt-security'` and the `security.headers` block **copied exactly from `docs/security.md` §8** (HSTS, XFO, XCTO, referrerPolicy, COOP, CORP, permissionsPolicy, full CSP including the documented `style-src 'unsafe-inline'` exception and `connect-src` allowlist). Add `corsHandler.origin: ['https://app.dpdpa-auditor.example']` per §8. Do NOT add §8.1 route-rate-limits here — those need the Redis store (P1-08/P1-18); note the deferral in the PR body. Add the `runtimeConfig` keys listed in Interfaces (env-driven; empty defaults fine locally).

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dpdpa/web test -- security-headers` → PASS.
Manual belt-and-braces (exit criteria of tasks.md §4.3): `pnpm --filter @dpdpa/web build && node apps/web/.output/server/index.mjs &` then `curl -I http://localhost:3000/` → paste header list into PR; kill the server.

- [x] **Step 5: Commit → PR → gates → merge**

Branch `feat/P1-23-nuxt-security`; commit `feat(web): nuxt-security headers and CSP per security.md §8`. Full gate chain.

---

### Task 5: P1-28 — health check page and status endpoint

**Files:**
- Create: `apps/web/server/api/health.get.ts`, `apps/web/app/pages/health.vue`
- Create: `apps/web/test/health.test.ts`

**Interfaces:**
- Consumes: default layout, token classes, state rules (§8: loading skeleton → content).
- Produces: `GET /api/health` → `200 { status: 'ok', version: string, uptimeSeconds: number, timestamp: string }` (shape typed in `app/types/health.ts` as `HealthStatus`); page route `/health` (public, default layout) renders that payload.

- [x] **Step 1: Write the failing tests**

`apps/web/test/health.test.ts`:
- `const res = await $fetch('/api/health')` → `res.status === 'ok'`, keys exactly `['status','version','uptimeSeconds','timestamp']`, `version` matches `^\d+\.\d+\.\d+` (read from `app/package.json` via `useRuntimeConfig`-free server import)
- page test: `mountSuspended(HealthPage)` initially shows skeleton (`aria-busy="true"` per §8), then resolved state shows "All systems operational" copy and the version — use a mocked `$fetch` or render against the real endpoint in e2e mode; simplest: extract `app/utils/formatHealth.ts` pure mapper and unit-test the page's render of a fixture payload (keeps the test hermetic).

- [x] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @dpdpa/web test -- health`
Expected: FAIL — route not found.

- [x] **Step 3: Implement endpoint + page**

- `server/api/health.get.ts`: `defineEventHandler` returning the shape (version from `../package.json` import, `uptimeSeconds: Math.round(process.uptime())`, ISO timestamp). Never expose env or build metadata beyond version.
- `app/pages/health.vue`: `useFetch('/api/health')`, loading = `LoadingSkeleton` pattern (inline `aria-busy` div matching final layout), success = one `h1` "System status", calm §13 copy, version + uptime rendered in `font-mono text-xs`. Public page, default layout.

- [x] **Step 4: Run tests to verify they pass + curl exit-criteria check**

Run: `pnpm --filter @dpdpa/web test` → green.
`curl -I` against preview server for `/health` → 200 (tasks.md exit criterion "/health returns 200").

- [x] **Step 5: Commit → PR → gates → merge**

Branch `feat/P1-28-health`; commit `feat(web): health status endpoint and page`. Full gate chain.

---

### Task 6: P1-29 — useState org/feature context and route middleware skeleton

**Files:**
- Create: `apps/web/app/utils/resolveRouteAccess.ts`, `apps/web/test/resolve-route-access.test.ts`
- Create: `apps/web/app/middleware/auth.global.ts`
- Create: `apps/web/app/composables/useAppContext.ts`
- Create: `apps/web/app/pages/login.vue`, `apps/web/app/pages/onboarding.vue` (minimal placeholders using `auth` layout — redirect targets must exist)
- Modify: `apps/web/app/pages/app/**` pages (they get the middleware automatically via global middleware)

**Interfaces:**
- Consumes: layouts from Task 3, `auth` layout.
- Produces: `resolveRouteAccess(path: string, ctx: { hasUser: boolean; hasOrg: boolean }): string | null` — returns `/login?redirect=<encoded path>` for `/app/**` without user, `/onboarding` for `/app/**` with user but no org, `null` otherwise (never matches `/login`, `/onboarding`, `/health`, `/`, non-`/app` paths); `useAppContext()` returning `useState` refs with keys exactly per design §7.6: `org` (`{ id, name, slug, plan, role, retentionDays } | null`), `features` (`Record<string, boolean>`), `commandPaletteOpen` (`boolean`), `lastScanId` (`string | null`); `auth.global.ts` calling the resolver for `to.path` and `navigateTo(redirect, { redirectCode: 302, replace: true })` when non-null.

- [x] **Step 1: Write the failing resolver tests**

`apps/web/test/resolve-route-access.test.ts` table-driven (Review Focus 4):
| path | hasUser | hasOrg | expected |
|---|---|---|---|
| `/app/scans` | false | false | `/login?redirect=%2Fapp%2Fscans` |
| `/app/scans` | true | false | `/onboarding` |
| `/app/scans` | true | true | `null` |
| `/login` | false | false | `null` (never loops) |
| `/onboarding` | true | false | `null` |
| `/health` | false | false | `null` |
| `/` | false | false | `null` |
| `/app` | true | false | `/onboarding` |

- [x] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @dpdpa/web test -- resolve-route-access`
Expected: FAIL — module not found.

- [x] **Step 3: Implement resolver, composable, middleware, placeholder pages**

- `resolveRouteAccess` pure function (no Nuxt imports) implementing the table.
- `useAppContext.ts`: four `useState` calls with the exact keys/shapes from Interfaces; initial `org: null`, `features: {}`, `commandPaletteOpen: false`, `lastScanId: null`. Header comment: SSR-safe, serialises to payload, no server data in Pinia (design §7.1/§7.6).
- `auth.global.ts`: `export default defineNuxtRouteMiddleware((to) => resolveRouteAccess(to.path, { hasUser, hasOrg }))` — `hasUser`/`hasOrg` read from `useAppContext()` (`hasUser` = a `user` useState key added by Phase 2 auth; for the skeleton use `org !== null || useState('user') presence` — implement as: user present when `useState('user')` is set; define `user` key as `unknown | null` with a TODO referencing Phase 2, so skeleton behaviour matches the table in tests via the pure resolver, and the middleware stays a thin wrapper).
- `login.vue` / `onboarding.vue`: `auth` layout, `h1`, one line of §13 copy, no fake auth UI (Phase 2 owns real auth).

- [x] **Step 4: Run tests to verify they pass + manual redirect check**

Run: `pnpm --filter @dpdpa/web test` → green.
Manual: preview server, `curl -I http://localhost:3000/app` → `302` (or 401-page flow) to `/login?redirect=%2Fapp`; `curl -I http://localhost:3000/login` → `200` (no loop).

- [x] **Step 5: Commit → PR → gates → merge**

Branch `feat/P1-29-route-access`; commit `feat(web): app context useState keys and auth route middleware skeleton`. Full gate chain.

---

### Task 7: P1-30 — Playwright harness with authenticated storage state stub

**Files:**
- Create: `apps/web/playwright.config.ts`, `apps/web/e2e/smoke.spec.ts`, `apps/web/e2e/a11y.spec.ts`
- Create: `apps/web/e2e/fixtures/auth.storage-state.json`
- Modify: `apps/web/package.json` (scripts `test:e2e`), root `package.json` (script `test:e2e`), `.github/workflows/ci.yml` (new `e2e` job), root branch protection (add `E2E` required context after first green run on main)

**Interfaces:**
- Consumes: built app (Tasks 1–6), skip link and health page.
- Produces: `pnpm test:e2e` runs Playwright chromium against the built preview server; `auth.storage-state.json` = `{ "cookies": [], "origins": [] }` with a `_comment` field documenting it as the Phase 2 authenticated-session stub (tests that need auth `storageState` this file); CI job `E2E` (install chromium with deps → build web → run e2e).

- [x] **Step 1: Write the failing e2e tests**

- `smoke.spec.ts`: (a) `/` loads, `h1` visible; (b) keyboard: press `Tab` → focused element is the skip link, press `Enter` → focus lands on `#main`; (c) `GET /health` → 200; (d) console collector asserts zero messages containing `Content Security Policy` (Review Focus 2) across `/`, `/app` (expect redirect to `/login`), `/health`.
- `a11y.spec.ts`: `@axe-core/playwright` scan of `/` and `/health` → zero `serious`/`critical` violations (design §9 verification).

- [x] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @dpdpa/web test:e2e`
Expected: FAIL — Playwright not installed / config missing.

- [x] **Step 3: Install and configure**

- `pnpm --filter @dpdpa/web add -D @playwright/test@1.65.0 @axe-core/playwright`; `npx playwright install chromium` (local only, no sudo deps on this machine — if `--with-deps` needed, note it for CI only).
- `playwright.config.ts`: `testDir: './e2e'`, `webServer: { command: 'pnpm preview', port: 3000, reuseExistingServer: !process.env.CI }` (build first in the script: `"test:e2e": "nuxt build && playwright test"`), `use: { baseURL: 'http://localhost:3000' }`.
- `auth.storage-state.json` stub as in Interfaces.

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @dpdpa/web test:e2e` → PASS (6 tests).
Also run full local gate: `set -o pipefail; pnpm lint && pnpm typecheck && pnpm exec turbo test --force && pnpm build && pnpm security:audit`.

- [x] **Step 5: Add CI job**

`.github/workflows/ci.yml` new job `e2e` (runs on the same triggers as `code`): setup pnpm/node with workspace cache → `pnpm install --frozen-lockfile` → `npx playwright install --with-deps chromium` → `pnpm --filter @dpdpa/web build` → `pnpm --filter @dpdpa/web exec playwright test` → upload Playwright report artifact on failure. Root `package.json` gets `"test:e2e": "pnpm --filter @dpdpa/web test:e2e"`.

- [x] **Step 6: Commit → PR → gates → merge, then promote check**

Branch `feat/P1-30-playwright`; commit `test(web): Playwright harness with a11y smoke and storage-state stub`. Full gate chain; confirm the new `E2E` job is green on the PR (it is not required yet). After merge + main green: `gh api repos/darshan192004/dpdp-auditor/branches/main/protection/required_status_checks/contexts -X POST -f context=E2E` and verify the context list now has 6 entries; record in the ledger.

**Done (2026-11-09):** PR #25 merged (`a7698b6`) with all 7 checks green; PR-Agent suggestions applied/declined with rationale (comment 6736395784). Promotion: the plan's `-f context=E2E` form is outdated (422 `missing required key: contexts`), and JSON via PowerShell stdin hit a 422 `data cannot be null` — the working call is `gh api -X POST .../required_status_checks/contexts --input <utf8-no-bom-file>` with `{"contexts":["E2E"]}`. Verified `count=6`: `Code CI`, `Secret scan`, `Docs lint (markdownlint)`, `Workflow lint (actionlint)`, `SAST (semgrep)`, `E2E`. Recorded in the ledger.

---

## Out of scope (recorded, not forgotten)

- **P1-26 / P1-27** (`callOrchestrator` + Nitro error handler): **done** in the backend foundation plan — merged as PR #30 (`bcbe53a`) and PR #31 (`ec5bc5a`).
- **P1-08…P1-10, P1-31…P1-34**: Platform/cloud track — deferred per standing local-only decision.
- **Backend P1-11…P1-21**: separate plan; needed before P1-26/27 and Phase 2.
- §8.1 route rate limits (Redis-backed) — deferred with P1-18.
- Real auth UI, command palette behaviour, sidebar plan-usage meter data — Phase 5 / Phase 2.
