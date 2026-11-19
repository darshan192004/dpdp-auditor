# Signal Console Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder `New*` views with reference-driven A+B+C dashboards and restore every dropped core flow, so the open-source MVP is genuinely complete.

**Architecture:** Keep the Nuxt shell, BFF routes, composables, shared types, auth and DS primitives; add a `components/dashboard/` layer of single-purpose, typed components and rebuild each page wrapper around them. Port tested legacy components (`ScanSubmitForm`, findings table/drawer/triager, `DownloadButton`) into the new views; never change backend contracts.

**Tech Stack:** Nuxt 4.6.4, Vue 3.5, TypeScript strict, Tailwind-style utility classes through Nuxt UI 3.3.7, existing `main.css` design tokens, Vitest + `@nuxt/test-utils/runtime`, Playwright MCP for visible browser verification.

**Spec:** `docs/superpowers/specs/2026-11-19-signal-console-redesign-design.md`

## Global Constraints

- No raw hex colours in any `.vue`/`.css` outside `app/assets/css/main.css` — `scripts/lint-tokens.mjs` fails the build on violations. Use only tokens that exist: ink (`50`–`900`), brand (`50/100/500/600/700/900`), surfaces (`canvas`, `surface`, `surface-raised`), risk (`risk-{critical,high,medium,low,info}-{bg,border,text,solid}`), status (`status-{compliant,partial,noncompliant,na}-{bg,border,text}`), confidence (`confidence-{direct,inferred,advisory}-{bg,text}`), plus `var(--color-overlay)`, `var(--shadow-card)`, `var(--motion-*)`, `var(--ease-out)`. There are **no** `success-*`, `critical-500`, `high-500`, `medium-500`, `low-500`, `info-500` or `shadow-card` utilities — do not invent them.
- No new runtime dependencies. Sparklines/trends are CSS/SVG only.
- No backend/API/orchestrator changes. All reads/writes go through existing `/api/v1/**` BFF routes.
- No billing, plans, trials, or commercial flows. No managed infrastructure work.
- Motion-rich UI with `prefers-reduced-motion` support retained; never remove the global override in `main.css`.
- PowerShell environment syntax only: `$env:NAME='value'; pnpm ...`. `bash` exists only at `C:\Program Files\Git\bin\bash.exe`.
- Never use `pnpm preview` (production `NODE_ENV` breaks `/api/auth/dev-session`). Use `pnpm --filter @dpdpa/web dev`.
- Never create files or caches on `C:`; use `D:\opencode-work\dpdp-auditor-tmp` for temp artifacts.
- Do not wait for PR CI after pushing.
- All visual verification uses Playwright MCP only (no CLI Playwright screenshots); save evidence under `.playwright-mcp/`.
- From repo root, run a single test file with `pnpm --filter @dpdpa/web exec vitest run test/<file>.test.ts`.

---

## File Structure

**Create (dashboard layer + tests):**
- `apps/web/app/components/dashboard/ScoreRing.vue` — score + grade + coverage in one unit.
- `apps/web/app/components/dashboard/SeverityBar.vue` — distribution bar from `ScanCounts`.
- `apps/web/app/components/dashboard/StatusChip.vue` — one status → one visual language.
- `apps/web/app/components/dashboard/DashboardPageHeader.vue` — title, subtitle, actions, breadcrumbs.
- `apps/web/app/components/dashboard/SectionCoverageGrid.vue` — DPDP §3–§8 readiness cards.
- `apps/web/app/components/dashboard/FixFirstList.vue` — ranked, actionable findings.
- `apps/web/app/components/dashboard/ScanTable.vue` — dense scan rows with filters + pagination.
- `apps/web/app/components/dashboard/TrendSparkline.vue` — optional CSS/SVG score trend.
- `apps/web/app/components/dashboard/index.ts` — barrel re-export of component names for tests.
- `apps/web/test/dashboard-primitives.test.ts`, `dashboard-overview.test.ts`, `dashboard-scan-table.test.ts`, `dashboard-flows.test.ts`.

**Modify (page wrappers and screen components):**
- `apps/web/app/pages/app/scans/index.vue` — data + filters + start-scan flow; renders `ScanTable`.
- `apps/web/app/pages/app/index.vue` — overview data; renders B dashboard.
- `apps/web/app/pages/app/scans/[scanId]/index.vue` — detail data + polling + cancel; renders A detail.
- `apps/web/app/pages/app/scans/[scanId]/findings.vue` — filters/sort/pagination + triage; renders A findings.
- `apps/web/app/pages/app/remediation/index.vue`, `app/rules/index.vue`, `app/rules/[code].vue`, `app/audit/index.vue`, `app/settings/org/index.vue`, `app/settings/api-keys/index.vue`, `app/repos/index.vue`, `app/repos/[repoId].vue`, `pages/invites/[token].vue`, `pages/report/[reportId].vue`, `pages/health.vue`.
- `apps/web/app/components/new/NewOverview.vue`, `NewScansList.vue`, `NewScanDetail.vue`, `NewFindings.vue`, `NewRemediationIndex.vue`, `NewRules.vue`, `NewAudit.vue`, `NewSettings.vue`, `NewReport.vue`, `NewHealth.vue`, `RemediationWorkspace.vue`, `ScoreCoverageDrilldown.vue` — replaced with rich screens (kept filenames to preserve existing imports/tests).
- `apps/web/app/assets/css/main.css` — add scanning spinner + shimmer keyframes and reduced-motion coverage only.
- `apps/web/app/components/scan/ScanProgress.vue` — add animated spinner/stage pulse.

**Reuse unchanged (interfaces must not be altered):**
`ScanSubmitForm.vue`, `FindingsTable.vue`, `FindingsFilterBar.vue`, `FindingDrawer.vue`, `TriageForm.vue`, `DownloadButton.vue`, `useFindingsQuery.ts`, `useScanPolling.ts`, `useToasts.ts`, all `components/ds/*`.

---

## Task 1: Dashboard primitives (ScoreRing, SeverityBar, StatusChip)

**Files:**
- Create: `apps/web/app/components/dashboard/ScoreRing.vue`
- Create: `apps/web/app/components/dashboard/SeverityBar.vue`
- Create: `apps/web/app/components/dashboard/StatusChip.vue`
- Create: `apps/web/test/dashboard-primitives.test.ts`

**Interfaces:**
- Consumes: `ScanGrade`, `CoverageAssessment`, `ScanCounts`, `ScanStatus`, `SCAN_STATUS_LABELS` from `~~/shared/scan`.
- Produces: `ScoreRing` props `{ score: number | null; grade: ScanGrade | null; coverage: CoverageAssessment; size?: 'sm' | 'lg' }`; `SeverityBar` props `{ counts: ScanCounts }`; `StatusChip` props `{ status: ScanStatus }`. All render semantic text so tests can assert on it.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/test/dashboard-primitives.test.ts
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import ScoreRing from '../app/components/dashboard/ScoreRing.vue';
import SeverityBar from '../app/components/dashboard/SeverityBar.vue';
import StatusChip from '../app/components/dashboard/StatusChip.vue';

const COUNTS = { critical: 1, high: 2, medium: 3, low: 4, info: 5, total: 15 };

describe('dashboard primitives', () => {
  it('ScoreRing never shows a score without coverage and grade', async () => {
    const full = await mountSuspended(ScoreRing, {
      props: { score: 82.6, grade: 'B', coverage: { state: 'full', note: null } },
    });
    expect(full.text()).toContain('82.6');
    expect(full.text()).toContain('B');
    expect(full.text()).toContain('full coverage');

    const partial = await mountSuspended(ScoreRing, {
      props: {
        score: 82.6,
        grade: null,
        coverage: { state: 'partial', note: 'Gitleaks did not run' },
      },
    });
    expect(partial.text()).toContain('partial coverage');
    expect(partial.text()).toContain('Gitleaks did not run');
    expect(partial.text()).not.toContain('grade B');
  });

  it('SeverityBar exposes each severity count and total', async () => {
    const wrapper = await mountSuspended(SeverityBar, { props: { counts: COUNTS } });
    for (const label of ['critical', 'high', 'medium', 'low', 'info']) {
      expect(wrapper.text()).toContain(label);
    }
    expect(wrapper.text()).toContain('15');
  });

  it('StatusChip labels every scan status consistently', async () => {
    for (const status of ['queued', 'scanning', 'completed', 'failed'] as const) {
      const wrapper = await mountSuspended(StatusChip, { props: { status } });
      expect(wrapper.find('[data-status]').attributes('data-status')).toBe(status);
      expect(wrapper.text().length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dpdpa/web exec vitest run test/dashboard-primitives.test.ts`
Expected: FAIL — `Failed to resolve import "../app/components/dashboard/ScoreRing.vue"`.

- [ ] **Step 3: Write minimal implementation**

```vue
<!-- apps/web/app/components/dashboard/ScoreRing.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import { formatScore, type CoverageAssessment, type ScanGrade } from '~~/shared/scan';

const props = withDefaults(
  defineProps<{
    score: number | null;
    grade: ScanGrade | null;
    coverage: CoverageAssessment;
    size?: 'sm' | 'lg';
  }>(),
  { size: 'lg' },
);

const shownGrade = computed(() => (props.coverage.state === 'full' ? props.grade : null));
const circumference = 2 * Math.PI * 42;
const dash = computed(() => {
  const value = Math.max(0, Math.min(100, props.score ?? 0));
  return `${(value / 100) * circumference} ${circumference}`;
});
</script>

<template>
  <div class="flex items-center gap-4" data-testid="score-ring">
    <div :class="size === 'lg' ? 'h-28 w-28' : 'h-16 w-16'" class="relative flex-shrink-0">
      <svg viewBox="0 0 100 100" class="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-ink-200)" stroke-width="8" />
        <circle
          cx="50" cy="50" r="42" fill="none" stroke="var(--color-brand-500)" stroke-width="8"
          stroke-linecap="round" :stroke-dasharray="dash"
        />
      </svg>
      <span class="absolute inset-0 flex items-center justify-center text-2xl font-semibold tabular-nums">
        {{ score === null ? '—' : formatScore(score) }}
      </span>
    </div>
    <div class="min-w-0">
      <p class="font-mono text-xs tracking-widest text-ink-400 uppercase">DPDP score</p>
      <p v-if="shownGrade" class="mt-1 text-lg font-semibold">grade {{ shownGrade }}</p>
      <p v-else class="text-ink-500 mt-1 text-sm">grade withheld</p>
      <p class="mt-1 text-xs text-ink-400">{{ coverage.state }} coverage</p>
      <p v-if="coverage.note" class="mt-1 text-xs text-ink-500">{{ coverage.note }}</p>
    </div>
  </div>
</template>
```

```vue
<!-- apps/web/app/components/dashboard/SeverityBar.vue -->
<script setup lang="ts">
import type { ScanCounts } from '~~/shared/scan';

const props = defineProps<{ counts: ScanCounts }>();

const LEVELS = [
  { key: 'critical', tone: 'bg-risk-critical-solid' },
  { key: 'high', tone: 'bg-risk-high-solid' },
  { key: 'medium', tone: 'bg-risk-medium-solid' },
  { key: 'low', tone: 'bg-risk-low-solid' },
  { key: 'info', tone: 'bg-risk-info-solid' },
] as const;

function width(key: keyof ScanCounts): string {
  const total = Math.max(1, props.counts.total);
  return `${(Number(props.counts[key]) / total) * 100}%`;
}
</script>

<template>
  <div data-testid="severity-bar">
    <div class="flex h-2 overflow-hidden rounded-[var(--radius-pill)] bg-ink-200" role="img"
      :aria-label="`${counts.total} findings by severity`">
      <div v-for="level in LEVELS" :key="level.key" :class="level.tone"
        :style="{ width: width(level.key) }" />
    </div>
    <dl class="mt-3 grid grid-cols-5 gap-2">
      <div v-for="level in LEVELS" :key="level.key">
        <dt class="font-mono text-[10px] tracking-wider text-ink-400 uppercase">{{ level.key }}</dt>
        <dd class="text-sm tabular-nums">{{ counts[level.key] }}</dd>
      </div>
    </dl>
  </div>
</template>
```

```vue
<!-- apps/web/app/components/dashboard/StatusChip.vue -->
<script setup lang="ts">
import { SCAN_STATUS_LABELS, type ScanStatus } from '~~/shared/scan';

defineProps<{ status: ScanStatus }>();

const TONES: Record<ScanStatus, string> = {
  queued: 'bg-ink-100 text-ink-600',
  cloning: 'bg-brand-100 text-brand-500',
  scanning: 'bg-brand-100 text-brand-500',
  mapping: 'bg-brand-100 text-brand-500',
  completed: 'bg-status-compliant-bg text-status-compliant-text',
  failed: 'bg-risk-critical-bg text-risk-critical-text',
  cancelled: 'bg-ink-100 text-ink-500',
  expired: 'bg-ink-100 text-ink-500',
};
</script>

<template>
  <span :data-status="status" :class="TONES[status]"
    class="rounded-[var(--radius-pill)] px-2 py-1 font-mono text-[11px] whitespace-nowrap">
    {{ SCAN_STATUS_LABELS[status] }}
  </span>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dpdpa/web exec vitest run test/dashboard-primitives.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/components/dashboard apps/web/test/dashboard-primitives.test.ts
git commit -m "feat(web): add dashboard score, severity and status primitives"
```

---

## Task 2: Overview building blocks (header, coverage grid, fix-first list)

**Files:**
- Create: `apps/web/app/components/dashboard/DashboardPageHeader.vue`
- Create: `apps/web/app/components/dashboard/SectionCoverageGrid.vue`
- Create: `apps/web/app/components/dashboard/FixFirstList.vue`
- Create: `apps/web/app/components/dashboard/TrendSparkline.vue`
- Create: `apps/web/test/dashboard-overview.test.ts`

**Interfaces:**
- Consumes: `ruleSections`, `RuleSectionOption` from `~~/shared/rules`; `FindingView` from `~~/shared/findings`; primitives from Task 1.
- Produces: `SectionCoverageGrid` props `{ sections: { code: string; title: string; state: 'ready' | 'partial' | 'at_risk'; controls: number }[] }`; `FixFirstList` props `{ findings: FindingView[]; limit?: number }` and emits `select: [finding: FindingView]`; `DashboardPageHeader` props `{ title: string; subtitle?: string }` with `#actions` slot; `TrendSparkline` props `{ values: number[] }` returning empty markup for arrays shorter than 2.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/test/dashboard-overview.test.ts
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import DashboardPageHeader from '../app/components/dashboard/DashboardPageHeader.vue';
import FixFirstList from '../app/components/dashboard/FixFirstList.vue';
import SectionCoverageGrid from '../app/components/dashboard/SectionCoverageGrid.vue';
import TrendSparkline from '../app/components/dashboard/TrendSparkline.vue';
import type { FindingView } from '../shared/findings';

const FINDING = (id: string, severity: 'critical' | 'high' | 'medium') => ({
  id, scanId: 'scn_1', scanner: 'gitleaks', scannerRuleId: 'rule-1', severity,
  confidence: 'direct', status: 'open', isNew: true, filePath: 'src/config.ts',
  lineStart: 10, lineEnd: 10, message: `Secret ${id}`,
  evidence: { hash: 'sha256:abc' }, dpdpa: { code: 'S6.3', section: '§6', title: 'Security', severity, rationale: null },
  remediation: { summary: 'Rotate the key', steps: ['Rotate'] },
}) as FindingView;

describe('overview building blocks', () => {
  it('renders section readiness states', async () => {
    const wrapper = await mountSuspended(SectionCoverageGrid, {
      props: { sections: [
        { code: '§3', title: 'Notice', state: 'ready', controls: 3 },
        { code: '§8', title: 'Retention', state: 'at_risk', controls: 2 },
      ] },
    });
    expect(wrapper.text()).toContain('READY');
    expect(wrapper.text()).toContain('AT RISK');
  });

  it('ranks the highest severity findings first and caps the list', async () => {
    const wrapper = await mountSuspended(FixFirstList, {
      props: { findings: [FINDING('low', 'medium'), FINDING('high', 'high'), FINDING('crit', 'critical')], limit: 2 },
    });
    expect(wrapper.text()).toContain('Secret crit');
    expect(wrapper.text()).toContain('Secret high');
    expect(wrapper.text()).not.toContain('Secret low');
    await wrapper.findAll('button')[0]!.trigger('click');
    expect(wrapper.emitted('select')?.[0]?.[0]).toMatchObject({ id: 'crit' });
  });

  it('header exposes actions slot and subtitle', async () => {
    const wrapper = await mountSuspended(DashboardPageHeader, {
      props: { title: 'Overview', subtitle: 'DPDP posture' },
      slots: { actions: '<button>New scan</button>' },
    });
    expect(wrapper.text()).toContain('Overview');
    expect(wrapper.text()).toContain('DPDP posture');
    expect(wrapper.text()).toContain('New scan');
  });

  it('sparkline renders nothing without enough history', async () => {
    const empty = await mountSuspended(TrendSparkline, { props: { values: [42] } });
    expect(empty.find('svg').exists()).toBe(false);
    const full = await mountSuspended(TrendSparkline, { props: { values: [40, 50, 60] } });
    expect(full.find('svg').exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dpdpa/web exec vitest run test/dashboard-overview.test.ts`
Expected: FAIL — missing modules.

- [ ] **Step 3: Write minimal implementation**

```vue
<!-- apps/web/app/components/dashboard/DashboardPageHeader.vue -->
<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>();
</script>

<template>
  <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div class="min-w-0">
      <h1 class="text-2xl font-semibold tracking-tight">{{ title }}</h1>
      <p v-if="subtitle" class="text-ink-400 mt-1 text-sm">{{ subtitle }}</p>
    </div>
    <div class="flex flex-wrap items-center gap-2"><slot name="actions" /></div>
  </header>
</template>
```

```vue
<!-- apps/web/app/components/dashboard/SectionCoverageGrid.vue -->
<script setup lang="ts">
type State = 'ready' | 'partial' | 'at_risk';
defineProps<{
  sections: { code: string; title: string; state: State; controls: number }[];
}>();

const TONES: Record<State, string> = {
  ready: 'border-status-compliant-border text-status-compliant-text bg-status-compliant-bg',
  partial: 'border-status-partial-border text-status-partial-text bg-status-partial-bg',
  at_risk: 'border-status-noncompliant-border text-status-noncompliant-text bg-status-noncompliant-bg',
};
const LABELS: Record<State, string> = { ready: 'READY', partial: 'PARTIAL', at_risk: 'AT RISK' };
</script>

<template>
  <section aria-labelledby="section-coverage-heading">
    <h2 id="section-coverage-heading" class="mb-3 font-mono text-xs tracking-widest text-ink-400 uppercase">
      DPDP section readiness
    </h2>
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <article v-for="section in sections" :key="section.code" :class="TONES[section.state]"
        class="rounded-[var(--radius-card)] border p-4">
        <p class="font-mono text-xs">{{ section.code }}</p>
        <p class="text-ink-900 mt-2 text-sm font-medium">{{ section.title }}</p>
        <p class="mt-3 font-mono text-[11px]">{{ LABELS[section.state] }}</p>
        <p class="text-ink-400 mt-1 text-xs">{{ section.controls }} controls</p>
      </article>
    </div>
  </section>
</template>
```

```vue
<!-- apps/web/app/components/dashboard/FixFirstList.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import type { FindingSeverity, FindingView } from '~~/shared/findings';

const props = withDefaults(defineProps<{ findings: FindingView[]; limit?: number }>(), { limit: 5 });
const emit = defineEmits<{ select: [finding: FindingView] }>();

const RANK: Record<FindingSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const ranked = computed(() =>
  [...props.findings].sort((a, b) => RANK[a.severity] - RANK[b.severity]).slice(0, props.limit),
);
</script>

<template>
  <section aria-labelledby="fix-first-heading">
    <h2 id="fix-first-heading" class="mb-3 font-mono text-xs tracking-widest text-ink-400 uppercase">
      Fix these first
    </h2>
    <ul class="divide-ink-200 divide-y rounded-[var(--radius-card)] border border-ink-200">
      <li v-for="finding in ranked" :key="finding.id">
        <button type="button" class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-ink-100"
          @click="emit('select', finding)">
          <span class="min-w-0">
            <span class="block truncate text-sm">{{ finding.message }}</span>
            <span class="text-ink-400 mt-1 block font-mono text-[11px]">
              {{ finding.severity }} · {{ finding.filePath }} · {{ finding.dpdpa?.code ?? 'unmapped' }}
            </span>
          </span>
          <span class="text-brand-500 font-mono text-xs">→</span>
        </button>
      </li>
    </ul>
    <p v-if="ranked.length === 0" class="text-ink-400 mt-2 text-sm">No open findings to rank.</p>
  </section>
</template>
```

```vue
<!-- apps/web/app/components/dashboard/TrendSparkline.vue -->
<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ values: number[] }>();

const points = computed(() => {
  if (props.values.length < 2) return '';
  const min = Math.min(...props.values);
  const max = Math.max(...props.values);
  const span = Math.max(1, max - min);
  return props.values
    .map((value, index) => {
      const x = (index / (props.values.length - 1)) * 100;
      const y = 30 - ((value - min) / span) * 26;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
});
</script>

<template>
  <svg v-if="points" viewBox="0 0 100 32" preserveAspectRatio="none" class="h-8 w-full" role="img"
    aria-label="Score trend">
    <polyline :points="points" fill="none" stroke="var(--color-brand-500)" stroke-width="2" />
  </svg>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dpdpa/web exec vitest run test/dashboard-overview.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/components/dashboard apps/web/test/dashboard-overview.test.ts
git commit -m "feat(web): add overview coverage and fix-first components"
```

---

## Task 3: ScanTable with filters and pagination

**Files:**
- Create: `apps/web/app/components/dashboard/ScanTable.vue`
- Create: `apps/web/test/dashboard-scan-table.test.ts`

**Interfaces:**
- Consumes: `ScanSummary`, `ScanListPage`, `SCAN_STATUSES`, `SCAN_STATUS_LABELS`, `formatScore` from `~~/shared/scan`; `StatusChip` from Task 1.
- Produces: props `{ scans: ScanSummary[]; pagination: ScanListPage['pagination']; status: ScanStatus | ''; loading?: boolean }`; emits `update:status: [value: ScanStatus | '']`, `update:page: [page: number]`, `newScan: []`. Row links use `/app/scans/${id}`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/test/dashboard-scan-table.test.ts
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import ScanTable from '../app/components/dashboard/ScanTable.vue';
import type { ScanSummary } from '../shared/scan';

const SCAN = (id: string, status: ScanSummary['status']) => ({
  id, repositoryId: 'repo_1', repositoryFullName: 'acme/repo', status, score: 82.6,
  grade: 'B' as const, counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
  createdAt: '2026-11-19T05:00:00Z', completedAt: null,
}) as ScanSummary;

const PAGINATION = { page: 1, pageSize: 25, totalItems: 40, totalPages: 2 };

describe('ScanTable', () => {
  it('renders dense rows with status, score and repository links', async () => {
    const wrapper = await mountSuspended(ScanTable, {
      props: { scans: [SCAN('scn_1', 'completed')], pagination: PAGINATION, status: '' },
    });
    expect(wrapper.text()).toContain('acme/repo');
    expect(wrapper.text()).toContain('82.6');
    expect(wrapper.find('a[href="/app/scans/scn_1"]').exists()).toBe(true);
  });

  it('emits status and page changes and a new-scan action', async () => {
    const wrapper = await mountSuspended(ScanTable, {
      props: { scans: [], pagination: PAGINATION, status: '' },
    });
    await wrapper.find('button[data-status-filter="completed"]').trigger('click');
    expect(wrapper.emitted('update:status')?.[0]?.[0]).toBe('completed');
    await wrapper.find('button[data-page="2"]').trigger('click');
    expect(wrapper.emitted('update:page')?.[0]?.[0]).toBe(2);
    await wrapper.find('button[data-action="new-scan"]').trigger('click');
    expect(wrapper.emitted('newScan')).toHaveLength(1);
  });

  it('shows an empty state when there are no scans', async () => {
    const wrapper = await mountSuspended(ScanTable, {
      props: { scans: [], pagination: { ...PAGINATION, totalItems: 0, totalPages: 1 }, status: '' },
    });
    expect(wrapper.text()).toContain('No scans yet');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dpdpa/web exec vitest run test/dashboard-scan-table.test.ts`
Expected: FAIL — missing module.

- [ ] **Step 3: Write minimal implementation**

```vue
<!-- apps/web/app/components/dashboard/ScanTable.vue -->
<script setup lang="ts">
import { computed } from 'vue';

import StatusChip from './StatusChip.vue';
import {
  SCAN_STATUSES, SCAN_STATUS_LABELS, formatScore,
  type ScanListPage, type ScanStatus, type ScanSummary,
} from '~~/shared/scan';

const props = withDefaults(
  defineProps<{
    scans: ScanSummary[];
    pagination: ScanListPage['pagination'];
    status: ScanStatus | '';
    loading?: boolean;
  }>(),
  { loading: false },
);

const emit = defineEmits<{
  'update:status': [value: ScanStatus | ''];
  'update:page': [page: number];
  newScan: [];
}>();

const options = [{ value: '' as const, label: 'All' }, ...SCAN_STATUSES.map((s) => ({ value: s, label: SCAN_STATUS_LABELS[s] }))];
const pages = computed(() => Array.from({ length: props.pagination.totalPages }, (_, i) => i + 1));
const when = (iso: string) => new Date(iso).toLocaleDateString();
</script>

<template>
  <section aria-labelledby="scans-table-heading">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 id="scans-table-heading" class="font-mono text-xs tracking-widest text-ink-400 uppercase">
        Scan history
      </h2>
      <button type="button" data-action="new-scan" class="bg-brand-500 text-ink-50 rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium"
        @click="emit('newScan')">+ New scan</button>
    </div>

    <div class="flex flex-wrap gap-2" role="group" aria-label="Filter scans by status">
      <button v-for="option in options" :key="option.value" type="button"
        :data-status-filter="option.value || 'all'"
        :aria-pressed="status === option.value" :disabled="loading"
        :class="status === option.value ? 'bg-brand-500 text-ink-50' : 'bg-ink-100 text-ink-600'"
        class="rounded-[var(--radius-pill)] px-2.5 py-1 font-mono text-[11px] disabled:opacity-40"
        @click="emit('update:status', option.value)">
        {{ option.label }}
      </button>
    </div>

    <div v-if="loading" role="status" class="text-ink-400 mt-4 text-sm">Loading scans.</div>
    <p v-else-if="scans.length === 0" class="text-ink-400 mt-6 text-sm">No scans yet.</p>
    <div v-else class="mt-4 overflow-x-auto rounded-[var(--radius-card)] border border-ink-200">
      <table class="w-full min-w-[640px] text-left text-sm">
        <thead class="bg-ink-100 font-mono text-[11px] tracking-wider text-ink-400 uppercase">
          <tr><th class="px-3 py-2">Repository</th><th class="px-3 py-2">Status</th>
            <th class="px-3 py-2">Score</th><th class="px-3 py-2">When</th></tr>
        </thead>
        <tbody class="divide-ink-200 divide-y">
          <tr v-for="scan in scans" :key="scan.id" class="hover:bg-ink-100">
            <td class="px-3 py-2">
              <NuxtLink :to="`/app/scans/${scan.id}`" class="text-brand-500 hover:underline">
                {{ scan.repositoryFullName }}
              </NuxtLink>
            </td>
            <td class="px-3 py-2"><StatusChip :status="scan.status" /></td>
            <td class="px-3 py-2 font-mono tabular-nums">
              {{ scan.score === null ? '—' : formatScore(scan.score) }}
            </td>
            <td class="text-ink-400 px-3 py-2 font-mono text-xs">{{ when(scan.createdAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <nav v-if="pages.length > 1" class="mt-4 flex gap-2" aria-label="Scan pages">
      <button v-for="page in pages" :key="page" type="button" :data-page="page"
        :aria-current="page === pagination.page ? 'page' : undefined"
        :class="page === pagination.page ? 'text-ink-50 bg-brand-500' : 'bg-ink-100 text-ink-600'"
        class="rounded-[var(--radius-control)] px-2 py-1 font-mono text-xs"
        @click="emit('update:page', page)">{{ page }}</button>
    </nav>
  </section>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dpdpa/web exec vitest run test/dashboard-scan-table.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/components/dashboard/ScanTable.vue apps/web/test/dashboard-scan-table.test.ts
git commit -m "feat(web): add filterable scan table"
```

---

## Task 4: Restore Start-scan flow on the Scans page

**Files:**
- Modify: `apps/web/app/pages/app/scans/index.vue`
- Test: `apps/web/test/dashboard-flows.test.ts` (added here, extended in Tasks 6–7)

**Interfaces:**
- Consumes: `ScanTable` (Task 3), existing `ScanSubmitForm`, `useAppContext`, `canManageScans`, `scanSubmitPath`, `SavedRepoView`, `ScanQuota`, `useToasts`.
- Produces: a working `POST /api/v1/scan` with `idempotency-key`, then `navigateTo('/app/scans/<id>')`; a `StartScanDrawer.vue` in `components/dashboard/` wrapping `DsDrawer` + `ScanSubmitForm` with props `{ open: boolean; repos: SavedRepoView[]; quota: ScanQuota | null; submitting: boolean }` and emits `close`, `submit: [payload]`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/test/dashboard-flows.test.ts
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import StartScanDrawer from '../app/components/dashboard/StartScanDrawer.vue';
import type { SavedRepoView } from '../shared/repo';

const REPOS: SavedRepoView[] = [{
  id: 'repo_1', fullName: 'acme/repo', defaultBranch: 'main', visibility: 'public',
  connectedAt: '2026-11-01T00:00:00Z',
}];

describe('start-scan flow', () => {
  it('hosts the restored ScanSubmitForm and forwards its payload', async () => {
    const wrapper = await mountSuspended(StartScanDrawer, {
      props: { open: true, repos: REPOS, quota: { used: 1, limit: 10 }, submitting: false },
    });
    expect(wrapper.find('form').exists()).toBe(true);
    expect(wrapper.text()).toContain('Start a scan');
    await wrapper.find('input#scan-url').setValue('https://github.com/acme/repo');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      githubUrl: 'https://github.com/acme/repo', profile: 'standard',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dpdpa/web exec vitest run test/dashboard-flows.test.ts`
Expected: FAIL — missing module.

- [ ] **Step 3: Write minimal implementation**

```vue
<!-- apps/web/app/components/dashboard/StartScanDrawer.vue -->
<script setup lang="ts">
import DsDrawer from '~/components/ds/DsDrawer.vue';
import ScanSubmitForm from '~/components/scan/ScanSubmitForm.vue';
import type { SavedRepoView } from '~~/shared/repo';
import type { ScanProfile, ScanQuota } from '~~/shared/scan';

const props = defineProps<{
  open: boolean;
  repos: SavedRepoView[];
  quota: ScanQuota | null;
  submitting?: boolean;
}>();
const emit = defineEmits<{
  close: [];
  submit: [payload: {
    repositoryId?: string; githubUrl?: string; ref?: string;
    profile: ScanProfile; idempotencyKey: string;
  }];
}>();

function onSubmit(payload: {
  repositoryId?: string; githubUrl?: string; ref?: string;
  profile: ScanProfile; idempotencyKey: string;
}): void {
  emit('submit', payload);
}
</script>

<template>
  <DsDrawer :open="open" title="Start a scan" @close="emit('close')">
    <ScanSubmitForm :repos="repos" :quota="quota" :can-submit="!submitting" @submit="onSubmit" />
    <p v-if="submitting" role="status" class="text-ink-400 mt-3 text-sm">Starting scan…</p>
  </DsDrawer>
</template>
```

Replace `apps/web/app/pages/app/scans/index.vue` entirely:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';

import ScanTable from '~/components/dashboard/ScanTable.vue';
import StartScanDrawer from '~/components/dashboard/StartScanDrawer.vue';
import DsErrorState from '~/components/ds/DsErrorState.vue';
import DashboardPageHeader from '~/components/dashboard/DashboardPageHeader.vue';
import { useAppContext } from '~/composables/useAppContext';
import { useToasts } from '~/composables/useToasts';
import type { SavedRepoView } from '~~/shared/repo';
import {
  canManageScans, scanSubmitPath,
  type ScanProfile, type ScanStatus,
} from '~~/shared/scan';

definePageMeta({ layout: 'app' });

const { org } = useAppContext();
const { push } = useToasts();
const canSubmit = computed(() => canManageScans(org.value?.role ?? null));

const status = ref<ScanStatus | ''>('');
const page = ref(1);
const drawerOpen = ref(false);
const submitting = ref(false);

const query = computed(() => {
  const params = new URLSearchParams({ page: String(page.value), pageSize: '25' });
  if (status.value) params.set('status', status.value);
  return `/api/v1/scans?${params.toString()}`;
});

const scansRequest = await useFetch<{ data: import('~~/shared/scan').ScanListPage }>(query);
const reposRequest = await useFetch<{ data: { items: SavedRepoView[] } }>('/api/v1/repos');
const items = computed(() => scansRequest.data.value?.data.items ?? []);
const pagination = computed(
  () => scansRequest.data.value?.data.pagination ?? { page: 1, pageSize: 25, totalItems: 0, totalPages: 1 },
);
const repos = computed(() => reposRequest.data.value?.data.items ?? []);
const quota = ref<{ used: number; limit: number } | null>(null);

function setStatus(value: ScanStatus | ''): void {
  status.value = value;
  page.value = 1;
}

async function startScan(payload: {
  repositoryId?: string; githubUrl?: string; ref?: string;
  profile: ScanProfile; idempotencyKey: string;
}): Promise<void> {
  submitting.value = true;
  try {
    const response = await $fetch<{ data: { id: string } }>(scanSubmitPath(), {
      method: 'POST', body: payload, headers: { 'idempotency-key': payload.idempotencyKey },
    });
    drawerOpen.value = false;
    push('success', 'Scan queued', 'The scan is now running.');
    await navigateTo(`/app/scans/${response.data.id}`);
  } catch {
    push('error', 'Scan could not be started', 'Check the repository URL and try again.');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="min-w-0">
    <DashboardPageHeader title="Scans" subtitle="Run a scan, then trace every finding back to evidence.">
      <template #actions>
        <button v-if="canSubmit" type="button" data-action="open-new-scan"
          class="bg-brand-500 text-ink-50 rounded-[var(--radius-control)] px-4 py-2 text-sm font-medium"
          @click="drawerOpen = true">+ New scan</button>
      </template>
    </DashboardPageHeader>

    <DsErrorState v-if="scansRequest.error.value" message="Scans could not be loaded."
      @retry="scansRequest.refresh" />

    <ScanTable :scans="items" :pagination="pagination" :status="status"
      :loading="scansRequest.status.value === 'pending'"
      @update:status="setStatus" @update:page="page = $event" @new-scan="drawerOpen = true" />

    <StartScanDrawer :open="drawerOpen" :repos="repos" :quota="quota" :submitting="submitting"
      @close="drawerOpen = false" @submit="startScan" />
  </div>
</template>
```

- [ ] **Step 4: Run test and typecheck**

Run: `pnpm --filter @dpdpa/web exec vitest run test/dashboard-flows.test.ts`
Expected: PASS (1 test).
Run: `pnpm --filter @dpdpa/web typecheck`
Expected: PASS (no TypeScript errors).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/components/dashboard/StartScanDrawer.vue apps/web/app/pages/app/scans/index.vue apps/web/test/dashboard-flows.test.ts
git commit -m "feat(web): restore start-scan flow on scans page"
```

---

## Task 5: Overview dashboard (B)

**Files:**
- Modify: `apps/web/app/pages/app/index.vue`
- Modify: `apps/web/app/components/new/NewOverview.vue`
- Test: `apps/web/test/dashboard-overview.test.ts` (append)

**Interfaces:**
- Consumes: catalog summary from existing `/api/v1/rules`; latest completed `ScanSummary` from `/api/v1/scans?status=completed&pageSize=1`; `ScanDetail` from `/api/v1/scan/:id`; `FindingsPage` from `/api/v1/scan/:id/findings`; Task 1–2 components.
- Produces: `NewOverview` props `{ stats: { label: string; value: string | number }[]; latestScan: ScanDetail | null; counts: ScanCounts; sections: { code: string; title: string; state: 'ready'|'partial'|'at_risk'; controls: number }[]; findings: FindingView[]; health: string }`.

- [ ] **Step 1: Write the failing test**

```ts
// append to apps/web/test/dashboard-overview.test.ts
it('NewOverview renders score ring, readiness grid and ranked actions', async () => {
  const NewOverview = (await import('../app/components/new/NewOverview.vue')).default;
  const wrapper = await mountSuspended(NewOverview, {
    props: {
      stats: [
        { label: 'Scored controls', value: 11 },
        { label: 'Sections covered', value: 7 },
      ],
      latestScan: {
        id: 'scn_1', status: 'completed', score: 82.6, grade: 'B',
        coverage: { semgrep: 'completed', checkov: 'completed', gitleaks: 'completed' },
        repository: { id: 'r1', fullName: 'acme/repo', visibility: 'public' },
      },
      counts: COUNTS,
      sections: [{ code: '§6', title: 'Security', state: 'partial', controls: 4 }],
      findings: [FINDING('f1', 'critical')],
      health: 'ok',
    },
  });
  expect(wrapper.text()).toContain('82.6');
  expect(wrapper.text()).toContain('grade B');
  expect(wrapper.text()).toContain('PARTIAL');
  expect(wrapper.text()).toContain('Secret f1');
  expect(wrapper.text()).toContain('ok');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dpdpa/web exec vitest run test/dashboard-overview.test.ts`
Expected: FAIL — props not accepted / content missing.

- [ ] **Step 3: Write minimal implementation**

```vue
<!-- apps/web/app/components/new/NewOverview.vue -->
<script setup lang="ts">
import { coverageFor, type ScanCounts, type ScanDetail, type ScanCoverage } from '~~/shared/scan';
import type { FindingView } from '~~/shared/findings';
import DashboardPageHeader from '~/components/dashboard/DashboardPageHeader.vue';
import FixFirstList from '~/components/dashboard/FixFirstList.vue';
import ScoreRing from '~/components/dashboard/ScoreRing.vue';
import SectionCoverageGrid from '~/components/dashboard/SectionCoverageGrid.vue';
import SeverityBar from '~/components/dashboard/SeverityBar.vue';
import ScanTable from '~/components/dashboard/ScanTable.vue';
import TrendSparkline from '~/components/dashboard/TrendSparkline.vue';

const props = defineProps<{
  stats: { label: string; value: string | number }[];
  latestScan: (Pick<ScanDetail, 'id' | 'status' | 'score' | 'grade' | 'coverage' | 'repository'> & Partial<ScanDetail>) | null;
  counts: ScanCounts;
  sections: { code: string; title: string; state: 'ready' | 'partial' | 'at_risk'; controls: number }[];
  findings: FindingView[];
  health: string;
  recentScans?: import('~~/shared/scan').ScanSummary[];
  trend?: number[];
}>();

const coverage = computed(() => coverageFor((props.latestScan?.coverage ?? {}) as ScanCoverage));
</script>

<template>
  <div class="min-w-0">
    <DashboardPageHeader title="Overview" subtitle="DPDP posture drawn from real repository evidence.">
      <template #actions>
        <NuxtLink to="/app/scans" class="bg-brand-500 text-ink-50 rounded-[var(--radius-control)] px-4 py-2 text-sm">
          + New scan
        </NuxtLink>
      </template>
    </DashboardPageHeader>

    <div class="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section class="bg-surface rounded-[var(--radius-card)] p-5 shadow-[var(--shadow-card)]">
        <ScoreRing v-if="latestScan" :score="latestScan.score" :grade="latestScan.grade" :coverage="coverage" />
        <p v-else class="text-ink-400 text-sm">No completed scan yet — start one to see your score.</p>
        <TrendSparkline v-if="trend" :values="trend" class="mt-5" />
      </section>
      <section class="bg-surface rounded-[var(--radius-card)] p-5 shadow-[var(--shadow-card)]">
        <p class="font-mono text-xs tracking-widest text-ink-400 uppercase">Scanner health</p>
        <p class="mt-2 text-lg font-semibold">{{ health }}</p>
        <dl class="mt-4 grid grid-cols-2 gap-3">
          <div v-for="stat in stats" :key="stat.label">
            <dt class="text-ink-400 text-xs">{{ stat.label }}</dt>
            <dd class="tabular-nums text-lg font-medium">{{ stat.value }}</dd>
          </div>
        </dl>
      </section>
    </div>

    <div class="mt-6 grid gap-6 xl:grid-cols-2">
      <SectionCoverageGrid :sections="sections" />
      <div class="bg-surface rounded-[var(--radius-card)] p-5 shadow-[var(--shadow-card)]">
        <h2 class="mb-3 font-mono text-xs tracking-widest text-ink-400 uppercase">Finding severity</h2>
        <SeverityBar :counts="counts" />
      </div>
    </div>

    <div class="mt-6 grid gap-6 xl:grid-cols-2">
      <FixFirstList :findings="findings" :limit="5" />
      <div v-if="recentScans?.length" class="min-w-0">
        <ScanTable :scans="recentScans" :pagination="{ page: 1, pageSize: 5, totalItems: recentScans.length, totalPages: 1 }" status="" />
      </div>
    </div>
  </div>
</template>
```

Replace `apps/web/app/pages/app/index.vue` with a wrapper that fetches catalog, health, latest scan and findings. Use `$fetch` for health and scan detail inside `useAsyncData`, guard with `null` on failure:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import NewOverview from '~/components/new/NewOverview.vue';
import { ruleSections, type RuleSectionOption, type RulesPage } from '~~/shared/rules';
import type { ScanDetail, ScanSummary, ScanListPage } from '~~/shared/scan';
import type { FindingsPage } from '~~/shared/findings';

definePageMeta({ layout: 'app' });

interface CatalogSummary {
  total: number; scored: number; sections: RuleSectionOption[]; mappings: number;
}

const catalogRequest = await useAsyncData<CatalogSummary>('overview-catalog', async () => {
  const page = await $fetch<RulesPage>('/api/v1/rules');
  const controls = page.data;
  return {
    total: controls.length,
    scored: controls.filter((rule) => rule.scored).length,
    sections: ruleSections(controls),
    mappings: controls.reduce((sum, rule) => sum + rule.mappings.length, 0),
  };
});

const latestRequest = await useAsyncData<ScanSummary | null>('overview-latest-scan', async () => {
  const page = await $fetch<{ data: ScanListPage }>('/api/v1/scans?status=completed&pageSize=1');
  return page.data.items[0] ?? null;
});

const scanId = computed(() => latestRequest.data.value?.id ?? '');
const detailRequest = await useAsyncData<ScanDetail | null>(
  'overview-scan-detail',
  () => (scanId.value ? $fetch<{ data: ScanDetail }>(`/api/v1/scan/${scanId.value}`).then((r) => r.data) : Promise.resolve(null)),
  { watch: [scanId] },
);
const findingsRequest = await useAsyncData<FindingsPage['data']>(
  'overview-findings',
  () => (scanId.value
    ? $fetch<FindingsPage>(`/api/v1/scan/${scanId.value}/findings?pageSize=100`).then((r) => r.data)
    : Promise.resolve([])),
  { watch: [scanId] },
);
const healthRequest = await useAsyncData<string>('overview-health', async () => {
  try {
    const health = await $fetch<{ status: string }>('/api/health');
    return health.status;
  } catch {
    return 'unavailable';
  }
});

const stats = computed(() => [
  { label: 'Scored controls', value: catalogRequest.data.value?.scored ?? 0 },
  { label: 'Sections covered', value: catalogRequest.data.value?.sections.length ?? 0 },
  { label: 'Scanner mappings', value: catalogRequest.data.value?.mappings ?? 0 },
  { label: 'Open findings', value: findingsRequest.data.value?.filter((f) => f.status === 'open').length ?? 0 },
]);
const sections = computed(() => (catalogRequest.data.value?.sections ?? []).map((section) => ({
  code: section.section, title: section.label,
  state: 'partial' as const, controls: section.count,
})));
</script>

<template>
  <NewOverview
    :stats="stats" :latest-scan="detailRequest.data.value ?? null"
    :counts="detailRequest.data.value?.counts ?? { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 }"
    :sections="sections" :findings="findingsRequest.data.value ?? []"
    :health="healthRequest.data.value ?? 'unavailable'"
    :recent-scans="latestRequest.data.value ? [latestRequest.data.value] : []"
  />
</template>
```

- [ ] **Step 4: Run tests, typecheck and token lint**

Run: `pnpm --filter @dpdpa/web exec vitest run test/dashboard-overview.test.ts`
Expected: PASS (5 tests).
Run: `pnpm --filter @dpdpa/web typecheck` and `pnpm --filter @dpdpa/web exec node scripts/lint-tokens.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/pages/app/index.vue apps/web/app/components/new/NewOverview.vue apps/web/test/dashboard-overview.test.ts
git commit -m "feat(web): build compliance posture overview dashboard"
```

---

## Task 6: Scan detail dashboard (A) + live progress + cancel

**Files:**
- Modify: `apps/web/app/pages/app/scans/[scanId]/index.vue`
- Modify: `apps/web/app/components/new/NewScanDetail.vue`
- Modify: `apps/web/app/components/scan/ScanProgress.vue`
- Modify: `apps/web/app/assets/css/main.css`
- Test: append to `apps/web/test/dashboard-flows.test.ts`

**Interfaces:**
- Consumes: `useScanPolling`, `ScanDetail`, `coverageFor`, `CoverageBanner`, `ScanProgress`, `ScoreCard`, `SectionBreakdown`, Task 1 components.
- Produces: `NewScanDetail` props `{ scan: ScanDetail; loading?: boolean }`, emits `cancel: [reason: string]`. Detail page POSTs `/api/v1/scan/:id/cancel` with `{ reason }` and refreshes.

- [ ] **Step 1: Write the failing test**

```ts
// append to apps/web/test/dashboard-flows.test.ts
it('scan detail shows score with coverage and a cancel action for running scans', async () => {
  const NewScanDetail = (await import('../app/components/new/NewScanDetail.vue')).default;
  const wrapper = await mountSuspended(NewScanDetail, {
    props: {
      // Cast the full contract shape so typecheck stays green; the component
      // only reads the fields shown here.
      scan: {
        id: 'scn_1', status: 'scanning', score: null, grade: null,
        coverage: { semgrep: 'running' },
        repository: { id: 'r1', fullName: 'acme/repo', visibility: 'public' },
        ref: 'main', commitSha: null, previousScore: null, sectionScores: {},
        counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
        scannerVersions: {}, rulePackVersion: null, scoringVersion: null, error: null,
        timestamps: { queuedAt: '2026-11-19T05:00:00Z', startedAt: null, completedAt: null, durationMs: null },
        links: { findings: '', events: '', report: '' },
      } as import('../shared/scan').ScanDetail,
    },
  });
  expect(wrapper.text()).toContain('acme/repo');
  expect(wrapper.text()).toContain('partial coverage');
  expect(wrapper.find('button[data-action="cancel"]').exists()).toBe(true);
  await wrapper.find('button[data-action="cancel"]').trigger('click');
  expect(wrapper.emitted('cancel')?.[0]?.[0]).toBe('Cancelled from the console');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dpdpa/web exec vitest run test/dashboard-flows.test.ts`
Expected: FAIL — cancel action missing.

- [ ] **Step 3: Write minimal implementation**

Replace `apps/web/app/components/new/NewScanDetail.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';

import CoverageBanner from '~/components/scan/CoverageBanner.vue';
import ScanProgress from '~/components/scan/ScanProgress.vue';
import ScoreCard from '~/components/scan/ScoreCard.vue';
import SectionBreakdown from '~/components/scan/SectionBreakdown.vue';
import DashboardPageHeader from '~/components/dashboard/DashboardPageHeader.vue';
import ScoreRing from '~/components/dashboard/ScoreRing.vue';
import SeverityBar from '~/components/dashboard/SeverityBar.vue';
import StatusChip from '~/components/dashboard/StatusChip.vue';
import { coverageFor, isTerminalStatus, type ScanDetail as ScanDetailView } from '~~/shared/scan';
import DsSkeleton from '~/components/ds/DsSkeleton.vue';

const props = withDefaults(defineProps<{ scan: ScanDetailView | null; loading?: boolean }>(), { loading: false });
const emit = defineEmits<{ cancel: [reason: string] }>();

const confirming = ref(false);
const coverage = computed(() => coverageFor(props.scan?.coverage ?? {}));
const running = computed(() => props.scan !== null && !isTerminalStatus(props.scan.status));
</script>

<template>
  <div class="min-w-0">
    <DsSkeleton v-if="loading || scan === null" class="mt-6 h-64" />
    <template v-else>
      <DashboardPageHeader :title="scan.repository.fullName" subtitle="Scan detail and evidence trail.">
        <template #actions>
          <StatusChip :status="scan.status" />
          <NuxtLink :to="`/app/scans/${scan.id}/findings`" class="rounded-[var(--radius-control)] border border-ink-300 px-3 py-1.5 text-sm">
            Findings
          </NuxtLink>
          <NuxtLink :to="`/app/scans/${scan.id}/coverage`" class="rounded-[var(--radius-control)] border border-ink-300 px-3 py-1.5 text-sm">
            Coverage
          </NuxtLink>
          <NuxtLink :to="`/report/${scan.id}`" class="rounded-[var(--radius-control)] border border-ink-300 px-3 py-1.5 text-sm">
            Report
          </NuxtLink>
          <button v-if="running" type="button" data-action="cancel"
            class="rounded-[var(--radius-control)] border border-risk-critical-border px-3 py-1.5 text-sm text-risk-critical-text"
            @click="confirming = true">Cancel scan</button>
        </template>
      </DashboardPageHeader>

      <div v-if="confirming" role="alertdialog" aria-label="Confirm cancellation" class="bg-surface mb-4 rounded-[var(--radius-card)] border border-risk-critical-border p-4">
        <p class="text-sm">Cancel this scan? Partial results are kept.</p>
        <div class="mt-3 flex gap-2">
          <button type="button" class="bg-risk-critical-solid text-ink-50 rounded-[var(--radius-control)] px-3 py-1.5 text-sm"
            @click="emit('cancel', 'Cancelled from the console'); confirming = false">Confirm cancel</button>
          <button type="button" class="rounded-[var(--radius-control)] border border-ink-300 px-3 py-1.5 text-sm" @click="confirming = false">Keep running</button>
        </div>
      </div>

      <section class="bg-surface grid gap-5 rounded-[var(--radius-card)] p-5 shadow-[var(--shadow-card)] lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <ScoreRing :score="scan.score" :grade="scan.grade" :coverage="coverage" />
        <div>
          <CoverageBanner v-if="coverage.note" :note="coverage.note" />
          <ScoreCard v-else :scan="scan" />
          <SeverityBar :counts="scan.counts" class="mt-5" />
        </div>
      </section>

      <ScanProgress v-if="running" :scan-id="scan.id" :status="scan.status"
        :coverage="scan.coverage" :timestamps="scan.timestamps" :can-cancel="false" />

      <SectionBreakdown :sections="scan.sectionScores" class="mt-6" />
    </template>
  </div>
</template>
```

Replace the detail page wrapper:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import NewScanDetail from '~/components/new/NewScanDetail.vue';
import DsErrorState from '~/components/ds/DsErrorState.vue';
import { useScanPolling } from '~/composables/useScanPolling';
import { useToasts } from '~/composables/useToasts';

definePageMeta({ layout: 'app' });

const route = useRoute();
const scanId = computed(() => String(route.params.scanId));
const { push } = useToasts();
const { scan, status, error, refresh } = await useScanPolling(scanId);

async function cancel(reason: string): Promise<void> {
  try {
    await $fetch(`/api/v1/scan/${scanId.value}/cancel`, { method: 'POST', body: { reason } });
    push('success', 'Scan cancelled', 'Partial results are still available.');
    await refresh();
  } catch {
    push('error', 'Cancel failed', 'The scan could not be cancelled. Try again.');
  }
}
</script>

<template>
  <div>
    <DsErrorState v-if="error.value" message="This scan could not be loaded." @retry="refresh" />
    <NewScanDetail :scan="scan" :loading="status.value === 'pending'" @cancel="cancel" />
  </div>
</template>
```

Add the spinner keyframes to `main.css` next to the motion vocabulary and extend the reduced-motion block (the `skeleton-shimmer` keyframe is deliberately added later in Task 9 so its regression test can fail first):

```css
@keyframes scan-spin { to { transform: rotate(360deg); } }
@keyframes scan-pulse { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }

@media (prefers-reduced-motion: reduce) {
  .scan-spinner, .scan-stage-active {
    animation: none !important;
  }
}
```

In `ScanProgress.vue`, use the existing `terminal` and `stage.state` variables (do not introduce new state). Add the spinner beside the elapsed clock in the header block, and pulse the current stage:

```vue
<!-- inside the header's "Elapsed" <p>, after the elapsed span -->
<span v-if="!terminal" class="scan-spinner inline-block h-3 w-3 rounded-full border-2 border-brand-500 border-t-transparent"
  style="animation: scan-spin 900ms linear infinite" aria-hidden="true" />

<!-- inside the stage <li>, before the stage label span -->
<span v-if="stage.state === 'current'" class="scan-stage-active"
  style="animation: scan-pulse 1.4s ease-in-out infinite" aria-hidden="true">●</span>
```

- [ ] **Step 4: Run tests, typecheck and token lint**

Run: `pnpm --filter @dpdpa/web exec vitest run test/dashboard-flows.test.ts test/scan-progress.test.ts`
Expected: PASS.
Run: `pnpm --filter @dpdpa/web typecheck` and `pnpm --filter @dpdpa/web exec node scripts/lint-tokens.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/pages/app/scans/'[scanId]'/index.vue apps/web/app/components/new/NewScanDetail.vue apps/web/app/components/scan/ScanProgress.vue apps/web/app/assets/css/main.css apps/web/test/dashboard-flows.test.ts
git commit -m "feat(web): build security-console scan detail with live progress and cancel"
```

---

## Task 7: Findings dashboard (A) with triage restored

**Files:**
- Modify: `apps/web/app/pages/app/scans/[scanId]/findings.vue`
- Modify: `apps/web/app/components/new/NewFindings.vue`
- Test: `apps/web/test/dashboard-flows.test.ts` (append)

**Interfaces:**
- Consumes: existing `useFindingsQuery`, `serialiseFindingsQuery`, `FindingsFilterBar`, `FindingsTable`, `FindingDrawer`, `TriageForm`, `useToasts`, `FindingView`, `FindingsPagination`.
- Produces: page owns filters, pagination, selection and `PATCH /api/v1/findings/:id`; `NewFindings` props `{ findings: FindingView[]; pagination: FindingsPagination; selected: FindingView | null; loading?: boolean }` and emits `select: [finding: FindingView]`, `close: []`, `triage: [draft: { status: FindingStatus; note?: string; externalUrl?: string }]`.

- [ ] **Step 1: Write the failing test**

```ts
// append to apps/web/test/dashboard-flows.test.ts
it('findings view forwards triage and selection', async () => {
  const NewFindings = (await import('../app/components/new/NewFindings.vue')).default;
  const finding = {
    id: 'f1', scanId: 'scn_1', scanner: 'semgrep', scannerRuleId: 'r1', severity: 'high',
    confidence: 'direct', status: 'open', isNew: true, filePath: 'src/a.ts', lineStart: 1, lineEnd: 2,
    message: 'Issue', evidence: { hash: 'sha256:abc' }, dpdpa: null,
    remediation: { summary: 'Fix it', steps: [] },
  } as const;
  const filters = {
    severity: [], scanner: [], section: [], status: [], file: '', q: '',
    page: 1, pageSize: 50, sort: '-severity' as const,
  };
  const wrapper = await mountSuspended(NewFindings, {
    props: {
      findings: [finding],
      pagination: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
      selected: finding,
      filters,
      sort: filters.sort,
      role: 'auditor',
    },
  });
  expect(wrapper.text()).toContain('Issue');
  expect(wrapper.text()).toContain('sha256:abc');
  expect(wrapper.text()).toContain('1 total');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dpdpa/web exec vitest run test/dashboard-flows.test.ts`
Expected: FAIL — new props not accepted.

- [ ] **Step 3: Write minimal implementation**

```vue
<!-- apps/web/app/components/new/NewFindings.vue -->
<script setup lang="ts">
import { computed } from 'vue';

import DashboardPageHeader from '~/components/dashboard/DashboardPageHeader.vue';
import SeverityBar from '~/components/dashboard/SeverityBar.vue';
import FindingDrawer from '~/components/findings/FindingDrawer.vue';
import FindingsFilterBar from '~/components/findings/FindingsFilterBar.vue';
import FindingsTable from '~/components/findings/FindingsTable.vue';
import DsSkeleton from '~/components/ds/DsSkeleton.vue';
import type {
  FindingSort, FindingStatus, FindingView, FindingsFilters, FindingsPagination,
} from '~~/shared/findings';

const props = withDefaults(defineProps<{
  findings: FindingView[];
  pagination: FindingsPagination;
  selected: FindingView | null;
  filters: FindingsFilters;
  sort: FindingSort;
  role: string;
  loading?: boolean;
  triaging?: boolean;
}>(), { loading: false, triaging: false });

const emit = defineEmits<{
  select: [finding: FindingView];
  close: [];
  triage: [draft: { status: FindingStatus; note?: string; externalUrl?: string }];
  'update:filters': [patch: Partial<FindingsFilters>];
  clear: [];
  'update:sort': [sort: FindingSort];
  'update:page': [page: number];
  'update:pageSize': [pageSize: number];
}>();

const counts = computed(() => ({
  critical: props.findings.filter((f) => f.severity === 'critical').length,
  high: props.findings.filter((f) => f.severity === 'high').length,
  medium: props.findings.filter((f) => f.severity === 'medium').length,
  low: props.findings.filter((f) => f.severity === 'low').length,
  info: props.findings.filter((f) => f.severity === 'info').length,
  total: props.findings.length,
}));
</script>

<template>
  <div class="min-w-0">
    <DashboardPageHeader title="Findings" subtitle="Every finding carries evidence, a DPDP mapping and a fix.">
      <template #actions><span class="text-ink-400 font-mono text-xs">{{ pagination.totalItems }} total</span></template>
    </DashboardPageHeader>

    <div class="bg-surface rounded-[var(--radius-card)] p-4 shadow-[var(--shadow-card)]">
      <SeverityBar :counts="counts" />
    </div>

    <FindingsFilterBar :filters="filters" :total-items="pagination.totalItems" class="mt-4"
      @update="emit('update:filters', $event)" @clear="emit('clear')" />

    <DsSkeleton v-if="loading" class="mt-4 h-64" />
    <FindingsTable v-else :findings="findings" :pagination="pagination" :sort="sort"
      :selected-id="selected?.id ?? null"
      @select="emit('select', $event)" @update:sort="emit('update:sort', $event)"
      @update:page="emit('update:page', $event)"
      @update:page-size="emit('update:pageSize', $event)" @clear="emit('clear')" />

    <FindingDrawer :finding="selected" :open="selected !== null" :role="role"
      :submitting="triaging" @update:open="!$event && emit('close')"
      @triage="emit('triage', $event)" />
  </div>
</template>
```

Replace the findings page wrapper. It must use `useFindingsQuery()` + `serialiseFindingsQuery(filters.value)` to build the URL (exactly as in `origin/main:apps/web/app/pages/app/scans/[scanId]/findings.vue` lines 10–45), pass `role` from `useAppContext()`, and implement triage as:

```ts
const { org } = useAppContext();
const { push } = useToasts();
const { filters, update, clear } = useFindingsQuery();
const requestUrl = computed(() => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(serialiseFindingsQuery(filters.value))) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else params.set(key, value);
  }
  const search = params.toString();
  return `/api/v1/scan/${scanId.value}/findings${search === '' ? '' : `?${search}`}`;
});
const { data, status, error, refresh } = await useFetch<FindingsPage>(requestUrl);

// Full wrapper imports: { computed, ref } from 'vue'; useAppContext, useToasts,
// useFindingsQuery, serialiseFindingsQuery, DsErrorState and NewFindings.
const findings = computed(() => data.value?.data ?? []);
const pagination = computed(
  () => data.value?.pagination ?? { page: 1, pageSize: 50, totalItems: 0, totalPages: 1 },
);
const selectedId = ref<string | null>(null);
const selected = computed(() => findings.value.find((f) => f.id === selectedId.value) ?? null);
const triaging = ref(false);

async function onTriage(draft: { status: FindingStatus; note?: string; externalUrl?: string }): Promise<void> {
  if (selectedId.value === null) return;
  triaging.value = true;
  try {
    await $fetch(`/api/v1/findings/${selectedId.value}`, { method: 'PATCH', body: draft });
    push('success', 'Disposition saved', `Status: ${draft.status}.`);
    selectedId.value = null;
    await refresh();
  } catch {
    push('error', 'Disposition not saved', 'The finding could not be updated. Try again.');
  } finally {
    triaging.value = false;
  }
}
```

Template: `<NewFindings :findings="findings" :pagination="pagination" :filters="filters" :sort="filters.sort" :role="org?.role ?? 'viewer'" :selected="selected" :loading="status === 'pending'" :triaging="triaging" @select="selectedId = $event.id" @close="selectedId = null" @update:filters="update" @clear="clear" @update:sort="update({ sort: $event })" @update:page="update({ page: $event })" @update:pageSize="update({ pageSize: $event })" @triage="onTriage" />`, with `DsErrorState` for `error.value` including requestId.

- [ ] **Step 4: Run tests and existing findings suite**

Run: `pnpm --filter @dpdpa/web exec vitest run test/dashboard-flows.test.ts test/findings-table.test.ts test/findings-filter-bar.test.ts test/triage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/pages/app/scans/'[scanId]'/findings.vue apps/web/app/components/new/NewFindings.vue apps/web/test/dashboard-flows.test.ts
git commit -m "feat(web): restore finding filters, pagination, drawer and triage"
```

---

## Task 8: Remediation, Rules and Audit screens

**Files:**
- Modify: `apps/web/app/pages/app/remediation/index.vue`, `app/rules/index.vue`, `app/rules/[code].vue`, `app/audit/index.vue`
- Modify: `apps/web/app/components/new/NewRemediationIndex.vue`, `RemediationWorkspace.vue`, `NewRules.vue`, `NewAudit.vue`
- Test: `apps/web/test/dashboard-flows.test.ts` (append smoke assertions for each screen)

**Interfaces:**
- Consumes: existing `/api/v1/scans`, `/api/v1/rules`, `/api/v1/audit-logs`, `/api/v1/scan/:id/findings` responses; `RuleCard`, `RuleMappingTable`, `SectionNav`, `DashboardPageHeader`, `StatusChip`.
- Produces: each screen renders its title, a filter/search control where the API supports it, and a data table/list with empty and error states. No new API calls.

- [ ] **Step 1: Write the failing tests**

```ts
// append to apps/web/test/dashboard-flows.test.ts — use literal dynamic imports
// (not a computed template string) so Vite can resolve the .vue modules.
it('rules, audit and remediation screens expose their data and controls', async () => {
  const rules = [{ code: 'S6.3', section: '§6', title: 'Encryption', summary: 'Encrypt data',
    obligation: 'Protect personal data', legalReference: 'DPDP Act §6', severity: 'high',
    weight: 2, scored: true, evidenceStrength: 'direct', tags: [], mappings: [],
    remediation: 'Enable encryption at rest' }];
  const events = [{ id: 1, actor: { type: 'user', id: null, name: 'dev@test' },
    action: 'scan.created', resource: { type: 'scan', id: 's1' }, ip: null, userAgent: null,
    metadata: {}, createdAt: '2026-11-19T00:00:00Z' }];
  const scans = [{ id: 's1', repositoryId: 'r1', repositoryFullName: 'acme/repo',
    status: 'completed', score: 90, grade: 'A',
    counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
    createdAt: '2026-11-19T00:00:00Z', completedAt: null }];

  const NewRules = (await import('../app/components/new/NewRules.vue')).default;
  const rulesView = await mountSuspended(NewRules, { props: { rules } });
  expect(rulesView.text()).toContain('Encryption');
  expect(rulesView.find('input[data-rule-search]').exists()).toBe(true);

  const NewAudit = (await import('../app/components/new/NewAudit.vue')).default;
  const auditView = await mountSuspended(NewAudit, { props: { events } });
  expect(auditView.text()).toContain('scan.created');
  expect(auditView.find('input[data-audit-action]').exists()).toBe(true);

  const NewRemediationIndex = (await import('../app/components/new/NewRemediationIndex.vue')).default;
  const remediationView = await mountSuspended(NewRemediationIndex, { props: { scans } });
  expect(remediationView.find('a[href="/app/scans/s1/remediation"]').exists()).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dpdpa/web exec vitest run test/dashboard-flows.test.ts`
Expected: FAIL — the search inputs and remediation link are not present yet.

- [ ] **Step 3: Write minimal implementation**

Replace each placeholder component with the following concrete implementation (keep the existing prop names — `rules`, `events`, `scans` — so current page wrappers and `new-remaining-screens.test.ts` keep working).

**`apps/web/app/components/new/NewRules.vue`:**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';

import DashboardPageHeader from '~/components/dashboard/DashboardPageHeader.vue';
import DsEmptyState from '~/components/ds/DsEmptyState.vue';
import RuleCard from '~/components/rules/RuleCard.vue';
import SectionNav from '~/components/rules/SectionNav.vue';
import { ruleSections, type RuleView } from '~~/shared/rules';

const props = withDefaults(
  defineProps<{
    rules: RuleView[];
    section?: string | null;
    loading?: boolean;
    error?: string | null;
  }>(),
  { section: null, loading: false, error: null },
);

const query = ref('');
const sections = computed(() => ruleSections(props.rules));
const visible = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return props.rules.filter((rule) =>
    (props.section === null || rule.section === props.section) &&
    (needle === '' || `${rule.code} ${rule.title}`.toLowerCase().includes(needle)),
  );
});
</script>

<template>
  <div class="min-w-0">
    <DashboardPageHeader title="Rules" subtitle="DPDP controls and their scanner mappings." />
    <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
      <SectionNav :sections="sections" :active="section" :scanner="null" />
      <div class="min-w-0">
        <input v-model="query" data-rule-search type="search" aria-label="Search controls"
          placeholder="Search code or title"
          class="bg-surface-raised text-ink-900 border-ink-300 rounded-[var(--radius-control)] w-full px-3 py-2 text-sm" />
        <DsEmptyState v-if="!loading && !error && visible.length === 0" title="No rules found" class="mt-6" />
        <p v-else-if="loading" role="status" class="text-ink-400 mt-6 text-sm">Loading rules…</p>
        <p v-else-if="error" role="alert" class="text-risk-critical-text mt-6 text-sm">{{ error }}</p>
        <div v-else class="mt-4 grid gap-3 xl:grid-cols-2">
          <RuleCard v-for="rule in visible" :key="rule.code" :rule="rule" />
        </div>
      </div>
    </div>
  </div>
</template>
```

**`apps/web/app/components/new/NewAudit.vue`:**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';

import DashboardPageHeader from '~/components/dashboard/DashboardPageHeader.vue';
import DsEmptyState from '~/components/ds/DsEmptyState.vue';
import type { AuditLogEntry } from '~~/shared/audit';

const props = withDefaults(
  defineProps<{
    events: AuditLogEntry[];
    loading?: boolean;
    error?: string | null;
  }>(),
  { loading: false, error: null },
);

const action = ref('');
const visible = computed(() => {
  const needle = action.value.trim().toLowerCase();
  return needle === ''
    ? props.events
    : props.events.filter((event) => event.action.toLowerCase().includes(needle));
});
const when = (iso: string) => new Date(iso).toLocaleString();
</script>

<template>
  <div class="min-w-0">
    <DashboardPageHeader title="Audit" subtitle="Every action, with actor and resource." />
    <div class="bg-surface mt-6 rounded-[var(--radius-card)] border border-ink-200 p-4">
      <label for="audit-action" class="text-ink-400 font-mono text-xs tracking-wider uppercase">Action</label>
      <input id="audit-action" v-model="action" data-audit-action type="search" placeholder="Filter by action"
        class="bg-surface-raised text-ink-900 border-ink-300 rounded-[var(--radius-control)] mt-2 w-full px-3 py-2 text-sm sm:max-w-xs" />
    </div>
    <DsEmptyState v-if="!loading && !error && visible.length === 0" title="No audit events" class="mt-6" />
    <p v-else-if="loading" role="status" class="text-ink-400 mt-6 text-sm">Loading audit log…</p>
    <p v-else-if="error" role="alert" class="text-risk-critical-text mt-6 text-sm">{{ error }}</p>
    <div v-else class="mt-4 overflow-x-auto rounded-[var(--radius-card)] border border-ink-200">
      <table class="w-full min-w-[640px] text-left text-sm">
        <thead class="bg-ink-100 font-mono text-[11px] tracking-wider text-ink-400 uppercase">
          <tr>
            <th class="px-3 py-2">When</th><th class="px-3 py-2">Actor</th>
            <th class="px-3 py-2">Action</th><th class="px-3 py-2">Resource</th>
          </tr>
        </thead>
        <tbody class="divide-ink-200 divide-y">
          <tr v-for="event in visible" :key="event.id" class="hover:bg-ink-100">
            <td class="text-ink-400 px-3 py-2 font-mono text-xs">{{ when(event.createdAt) }}</td>
            <td class="px-3 py-2">{{ event.actor.name ?? event.actor.id ?? event.actor.type }}</td>
            <td class="px-3 py-2 font-mono text-xs">{{ event.action }}</td>
            <td class="px-3 py-2 font-mono text-xs">
              {{ event.resource.type }}{{ event.resource.id ? `:${event.resource.id}` : '' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
```

**`apps/web/app/components/new/NewRemediationIndex.vue`:**

```vue
<script setup lang="ts">
import { computed } from 'vue';

import DashboardPageHeader from '~/components/dashboard/DashboardPageHeader.vue';
import StatusChip from '~/components/dashboard/StatusChip.vue';
import DsEmptyState from '~/components/ds/DsEmptyState.vue';
import type { ScanSummary } from '~~/shared/scan';

const props = withDefaults(
  defineProps<{
    scans: ScanSummary[];
    loading?: boolean;
    error?: string | null;
  }>(),
  { loading: false, error: null },
);

const completed = computed(() => props.scans.filter((scan) => scan.status === 'completed'));
</script>

<template>
  <div class="min-w-0">
    <DashboardPageHeader title="Remediation" subtitle="Choose a completed scan to triage its findings." />
    <DsEmptyState v-if="!loading && !error && completed.length === 0" title="No completed scans to triage" class="mt-6" />
    <p v-else-if="loading" role="status" class="text-ink-400 mt-6 text-sm">Loading scans…</p>
    <p v-else-if="error" role="alert" class="text-risk-critical-text mt-6 text-sm">{{ error }}</p>
    <div v-else class="mt-6 grid gap-3 xl:grid-cols-2">
      <NuxtLink v-for="scan in completed" :key="scan.id" :to="`/app/scans/${scan.id}/remediation`"
        class="bg-surface hover:border-brand-500 rounded-[var(--radius-card)] border border-ink-200 p-4 transition-colors">
        <span class="flex items-start justify-between gap-3">
          <span class="text-sm font-medium">{{ scan.repositoryFullName }}</span>
          <StatusChip :status="scan.status" />
        </span>
        <span class="text-ink-400 mt-3 block font-mono text-xs">
          {{ scan.counts.total }} findings · {{ scan.grade ?? 'no grade' }}
        </span>
      </NuxtLink>
    </div>
  </div>
</template>
```

Update the four page wrappers to pass the real API data and keep their existing error/empty states:

| Wrapper | Fetch | Prop mapping |
| --- | --- | --- |
| `app/rules/index.vue` | `useFetch<RulesPage>('/api/v1/rules')` | `:rules="data?.data ?? []"` `:section="route.query.section ?? null"` `:loading` `:error` |
| `app/audit/index.vue` | `useFetch<AuditLogListResponse>('/api/v1/audit-logs?page=1&pageSize=50')` | `:events="data?.data ?? []"` `:loading` `:error` |
| `app/remediation/index.vue` | `useFetch<{ data: ScanListPage }>('/api/v1/scans?page=1&pageSize=100')` | `:scans="data?.data.items ?? []"` `:loading` `:error` |
| `app/rules/[code].vue` | `useFetch<{ data: RuleView }>('/api/v1/rules/<code>')` | render `RuleCard` + `RuleMappingTable` from `shared/rules` data, keeping the existing page header and back link |

Page-level `role="alert"` errors must include the API `requestId` where the error envelope exposes one.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @dpdpa/web exec vitest run test/dashboard-flows.test.ts test/rule-components.test.ts test/rules.test.ts`
Expected: PASS.
Run: `pnpm --filter @dpdpa/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/components/new apps/web/app/pages/app apps/web/test/dashboard-flows.test.ts
git commit -m "feat(web): restyle rules, audit and remediation dashboards"
```

---

## Task 9: Remaining screens, motion polish and full gate suite

**Files:**
- Modify: remaining `New*`/page wrappers (`NewSettings.vue`, `NewHealth.vue`, `NewReport.vue`, `app/settings/org`, `app/settings/api-keys`, `app/repos`, `app/repos/[repoId]`, `invites/[token]`, `report/[reportId]`, `health.vue`)
- Modify: `apps/web/app/assets/css/main.css`, `apps/web/app/components/ds/DsSkeleton.vue`, `apps/web/app/components/new/NewFindings.vue`
- Test: `apps/web/test/dashboard-flows.test.ts` (append reduced-motion CSS assertion)

**Interfaces:**
- Consumes: existing settings/API-key/invite/report APIs; `useToasts`; motion tokens.
- Produces: consistent page headers, tables, empty/error states across all remaining screens; `DsSkeleton` uses `skeleton-shimmer` keyframes; row reveal uses bounded `transition-delay` capped at 20 rows.

- [ ] **Step 1: Write the failing test**

```ts
// append to apps/web/test/dashboard-flows.test.ts
it('tokens define motion animations and reduced-motion coverage', async () => {
  const { readFileSync } = await import('node:fs');
  // import.meta.url keeps this stable whether Vitest runs from repo root or apps/web.
  const css = readFileSync(new URL('../app/assets/css/main.css', import.meta.url), 'utf8');
  expect(css).toContain('@keyframes scan-spin');
  expect(css).toContain('@keyframes scan-pulse');
  expect(css).toContain('@keyframes skeleton-shimmer');
  expect(css).toContain('prefers-reduced-motion: reduce');
  expect(css).toContain('.ds-skeleton');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dpdpa/web exec vitest run test/dashboard-flows.test.ts`
Expected: FAIL on `@keyframes skeleton-shimmer` (Task 6 added only `scan-spin` and `scan-pulse`). The other four assertions already pass.

- [ ] **Step 3: Write minimal implementation**

Apply `DashboardPageHeader` + `StatusChip` + `DsEmptyState` to the remaining screens. In `app/assets/css/main.css`, add the shimmer keyframe next to the Task 6 keyframes and extend the existing reduced-motion block:

```css
@keyframes skeleton-shimmer {
  from { background-position: -200% 0; }
  to { background-position: 200% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .scan-spinner, .scan-stage-active, .ds-skeleton {
    animation: none !important;
  }
}
```

Add to `DsSkeleton.vue` scoped styles and set `class="ds-skeleton"` on the root element:

```css
.ds-skeleton {
  background: linear-gradient(90deg, var(--color-ink-100) 25%, var(--color-ink-200) 50%, var(--color-ink-100) 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s linear infinite;
}
```

In `NewFindings.vue`, cap row reveal delays at 20 rows on the finding row elements:

```vue
:style="{ transitionDelay: `${Math.min(index, 19) * 20}ms` }"
class="transition-[transform,opacity] duration-[var(--motion-base)] ease-[var(--ease-out)]"
```

- [ ] **Step 4: Run the full gate suite**

Run these commands from repo root and require exit 0 for each:
`pnpm lint`
`pnpm --filter @dpdpa/web typecheck`
`pnpm --filter @dpdpa/web test`
`pnpm --filter @dpdpa/web build`
`pnpm audit --omit=dev`
Expected: all PASS; 422-test suite green; no raw-hex token violations.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): finish dashboard restyle and motion polish"
```

---

## Task 10: Visible Playwright MCP verification and MVP verdict

**Files:**
- Evidence: `.playwright-mcp/redesign-*.png`, `.playwright-mcp/redesign-walkthrough.webm`, `.playwright-mcp/frontend-verification.md`
- No source changes unless a defect is found (fix in place with a test and commit).

**Interfaces:**
- Consumes: running web on `http://localhost:3000` in real mode (`ORCHESTRATOR_URL=http://localhost:3101`, no `NUXT_FIXTURES`), orchestrator on `3101`, Redis on `6379`, dev session via `POST /api/auth/dev-session`.
- Produces: a table of 18 screen/interaction results, 0 console errors, and an explicit MVP verdict.

- [ ] **Step 1: Start the runtime (if not already running)**

```powershell
$env:TEMP='D:\opencode-work\dpdp-auditor-tmp'; $env:TMP=$env:TEMP
& 'D:\opencode-work\dpdp-auditor-tmp\redis\redis-server.exe' --port 6379 --appendonly no
powershell -NoProfile -ExecutionPolicy Bypass -File 'D:\opencode-work\dpdp-auditor-tmp\start-orchestrator.ps1'
powershell -NoProfile -ExecutionPolicy Bypass -File 'D:\opencode-work\dpdp-auditor-tmp\start-web-real.ps1'
```

Verify `GET http://localhost:3101/health` returns `{"status":"ok",...}` and the web root loads.

- [ ] **Step 2: Bootstrap the session and open the console in Playwright MCP**

Use `browser_navigate` to `http://localhost:3000/app`; if redirected to login, call `browser_evaluate` with `async () => { const r = await fetch('/api/auth/dev-session', { method:'POST' }); return { status: r.status, body: await r.text() }; }` and expect 200, then navigate back to `/app`.

- [ ] **Step 3: Walk every screen with visible MCP calls**

For each route in `/app`, `/app/scans`, `/app/scans/e4fab596-dfa2-4926-951a-bea92d31701f`, its `/findings`, `/coverage`, `/remediation`, `/app/remediation`, `/app/rules`, a rule detail, `/app/audit`, `/app/settings/org`, `/app/settings/api-keys`, `/app/repos`, a repo detail, `/health`, `/report/<id>`: call `browser_snapshot`, then `browser_take_screenshot` with `filename: ".playwright-mcp/redesign-<screen>.png"`, `fullPage: true`, `scale: "css"`. Check `browser_console_messages({ level: "error" })` after each; expect 0 errors.

- [ ] **Step 4: Verify the restored flows end to end**

1. Click `+ New scan`, fill `https://github.com/improwised/jovVix`, submit, confirm redirect to `/app/scans/<id>` and a `queued`/`scanning` status.
2. Open an existing completed scan, open a finding, submit a triage change, confirm toast and refreshed row.
3. Open the Report tab and download the PDF; verify the file is non-empty and starts with `%PDF-`.
4. Exercise status filters and pagination on Scans; exercise Audit filters; open Settings and API keys.
5. Verify route transitions and score-rise via `browser_evaluate` MutationObserver; toggle reduced motion in the browser and re-check that animations compute to `none`.

- [ ] **Step 5: Write the evidence table and verdict**

Update `.playwright-mcp/frontend-verification.md` with the 18-row result table, console-error count, defect list (fixed or outstanding), and an explicit statement of whether the app is MVP-ready. Do not say "done" unless every core flow passed in the browser.

- [ ] **Step 6: Commit evidence**

```bash
git add .playwright-mcp
git commit -m "docs(web): record visible Playwright MCP redesign verification"
```

---

## Self-Review Notes

- **Spec coverage:** all decisions 1–9 map to Tasks 1–10; A+B+C mapping is in Tasks 2/3/5/6/7/8; all flows in Tasks 4/6/7/8/9; motion in Tasks 6/9; verification in Task 10.
- **Placeholder scan:** no TBD/TODO; every code step includes concrete code or an exact command with expected output.
- **Type consistency:** `ScanDetail`, `ScanSummary`, `ScanCounts`, `FindingView`, `FindingsFilters`, `FindingsPagination`, `ScanProfile`, `ScanQuota` are used with the exact field names defined in `shared/scan.ts` and `shared/findings.ts`.
