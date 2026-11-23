# Frontend Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline execution was chosen by the user). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `apps/web` in place as the Signal Console described by `DESIGN.md`, with modern toasts/breadcrumbs/motion, two new evidence-first screens, and visible Playwright verification.

**Architecture:** Strangler in place. A dev-only `NUXT_PUBLIC_NEW_UI` flag selects a new shell and new screen components while the existing screens remain intact. Each migrated screen passes its own test gate; old code is deleted only after parity.

**Tech Stack:** Nuxt 4, Vue 3 `<script setup>`, strict TypeScript, Tailwind 4 + `@theme` tokens, Nuxt UI, Vitest, `@nuxt/test-utils`, Playwright, axe-core.

**Spec:** `docs/superpowers/specs/2026-11-18-frontend-rebuild-design.md`

## Global Constraints

- Keep TypeScript strict; no `any`, `@ts-ignore`, or disabled lint rules without a documented reason.
- Raw hex colours may appear **only** in `apps/web/app/assets/css/main.css` (enforced by `apps/web/scripts/lint-tokens.mjs`).
- Dark-only palette; no gradients, glow, or light theme. One `h1` per page; no skipped heading levels.
- All motion must collapse to ~0 ms under `prefers-reduced-motion`.
- Open-source scope only: no billing, paid plans, or commercial flows.
- Do not create new files or caches on `C:`; use `D:` paths. Set `$env:TEMP` and `$env:TMP` to `D:\worktrees\dpdp-auditor\p3-scan-ui\.tmp` for every shell task.
- Browser artifacts go under `D:\worktrees\dpdp-auditor\p3-scan-ui\.playwright-mcp`. From `apps/web`, that path is `../../.playwright-mcp`.
- Do **not** use `pnpm preview`; Nuxt forces `NODE_ENV=production` and `/api/auth/dev-session` returns 404. Use `pnpm dev` for Playwright.
- PowerShell env syntax: `$env:NUXT_PUBLIC_NEW_UI='1'; pnpm ...`, not `NUXT_PUBLIC_NEW_UI=1 pnpm ...`.
- Keep all existing `/api/v1/*` BFF routes and orchestrator contracts unchanged.
- The Remediation workspace shows real status changes only; the findings API has no assignee field, so no assignee affordance or local-only substitute is added.
- Feature flag `NUXT_PUBLIC_NEW_UI=1` is dev-only; production default is off until final cleanup.
- After each UI task, run a visible Playwright check against the dev server, save a screenshot under `.playwright-mcp/`, and append a row to `.playwright-mcp/frontend-verification.md` before moving on.

---

### Task 1: Feature flag, motion tokens, DESIGN.md alignment, and bundle baseline

**Files:**
- Modify: `apps/web/nuxt.config.ts:55-60`
- Modify: `apps/web/app/assets/css/main.css` (`@theme` and end of file)
- Modify: `apps/web/test/tokens.test.ts`
- Modify: `DESIGN.md:94-95` and `DESIGN.md:226-240`
- Create: `.playwright-mcp/bundle-baseline.txt`

**Interfaces:**
- Produces: `useRuntimeConfig().public.newUi: boolean`
- Produces CSS tokens: `--motion-fast`, `--motion-base`, `--motion-slow`, `--ease-out`, `--color-overlay`.

- [ ] **Step 1: Capture the bundle baseline before changing code**

Run:

```powershell
$env:TEMP='D:\worktrees\dpdp-auditor\p3-scan-ui\.tmp'; $env:TMP=$env:TEMP
pnpm --filter @dpdpa/web build
$bytes = (Get-ChildItem 'apps/web/.output/public/_nuxt' -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
New-Item -ItemType Directory -Force -Path '.playwright-mcp' | Out-Null
Set-Content -Path '.playwright-mcp/bundle-baseline.txt' -Value $bytes
```

Expected: build exit 0; baseline file contains a byte count.

- [ ] **Step 2: Write the failing token test**

Append to `apps/web/test/tokens.test.ts`:

```ts
const MOTION_TOKENS: Record<string, string> = {
  '--motion-fast': '120ms',
  '--motion-base': '180ms',
  '--motion-slow': '260ms',
  '--ease-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
  '--color-overlay': 'rgb(0 0 0 / 0.6)',
};

describe('motion and overlay tokens', () => {
  const css = readFileSync(CSS_PATH, 'utf8');
  for (const [token, value] of Object.entries(MOTION_TOKENS)) {
    it(`pins ${token} to ${value}`, () => {
      expect(css).toContain(`${token}: ${value}`);
    });
  }
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @dpdpa/web test -- test/tokens.test.ts`
Expected: FAIL with a missing `--motion-fast` assertion.

- [ ] **Step 4: Implement the flag and tokens**

In `apps/web/nuxt.config.ts`, inside `runtimeConfig.public` after `appUrl`:

```ts
      // Strangler flag for the Signal Console rebuild (spec Decisions 4/6).
      newUi: process.env.NUXT_PUBLIC_NEW_UI === '1',
```

In `apps/web/app/assets/css/main.css`, inside `@theme` after the shadow tokens:

```css
  /* Motion vocabulary — motion-rich UI, collapsed by prefers-reduced-motion. */
  --motion-fast: 120ms;
  --motion-base: 180ms;
  --motion-slow: 260ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --color-overlay: rgb(0 0 0 / 0.6);
```

Append to the end of `apps/web/app/assets/css/main.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

In `DESIGN.md`, replace the two-line sentence at lines 94-95 with:

```md
This document is the source of truth; `apps/web/app/assets/css/main.css` implements these values and is the only file allowed to contain raw hex colours.
```

Append to the "Do's and Don'ts" section:

```md
### Motion vocabulary

Route transitions use `--motion-base`, micro-interactions use `--motion-fast`, and drawers/toasts use `--motion-slow`, all with `--ease-out`. Finding-row staggering is capped at 20 rows. Every animation collapses to near-zero under `prefers-reduced-motion`. No gradients, glow, or light theme.
```

- [ ] **Step 5: Run the test and lint**

Run: `pnpm --filter @dpdpa/web test -- test/tokens.test.ts; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; pnpm lint`
Expected: PASS; lint exit 0.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/nuxt.config.ts apps/web/app/assets/css/main.css apps/web/test/tokens.test.ts DESIGN.md .playwright-mcp/bundle-baseline.txt
git commit -m "feat(web): add Signal Console flag and motion tokens"
```

---

### Task 2: Design-system primitives, toasts, breadcrumbs, and score card

**Files:**
- Create: `apps/web/app/types/toast.ts`
- Create: `apps/web/app/composables/useToasts.ts`
- Create: `apps/web/app/utils/breadcrumbs.ts`
- Create: `apps/web/app/components/ds/DsButton.vue`
- Create: `apps/web/app/components/ds/DsCard.vue`
- Create: `apps/web/app/components/ds/DsBadge.vue`
- Create: `apps/web/app/components/ds/DsInput.vue`
- Create: `apps/web/app/components/ds/DsSkeleton.vue`
- Create: `apps/web/app/components/ds/DsScoreCard.vue`
- Create: `apps/web/app/components/ds/DsFindingRow.vue`
- Create: `apps/web/app/components/ds/DsFilterChips.vue`
- Create: `apps/web/app/components/ds/DsEmptyState.vue`
- Create: `apps/web/app/components/ds/DsErrorState.vue`
- Create: `apps/web/app/components/ds/DsToastHost.vue`
- Create: `apps/web/app/components/ds/DsBreadcrumb.vue`
- Create: `apps/web/app/components/ds/DsDrawer.vue`
- Create: `apps/web/test/use-toasts.test.ts`
- Create: `apps/web/test/breadcrumbs.test.ts`
- Create: `apps/web/test/design-system.test.ts`

**Interfaces:**
- Consumes: CSS tokens from Task 1.
- Produces: `useToasts()` → `{ toasts: Ref<Toast[]>, push(tone, title, message?): string, dismiss(id): void }`.
- Produces: `breadcrumbsFor(path: string): Crumb[]` where `Crumb = { label: string; to?: string }`.
- Produces: components listed above. `DsScoreCard` always renders score, grade, coverage and a findings link.

- [ ] **Step 1: Write failing tests**

`apps/web/test/use-toasts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { useToasts } from '../app/composables/useToasts';

describe('useToasts', () => {
  it('pushes and dismisses a toast', () => {
    const { toasts, push, dismiss } = useToasts();
    const before = toasts.value.length;
    const id = push('success', 'Scan started', 'Queued for scanning.');
    expect(toasts.value.at(-1)).toMatchObject({
      id,
      tone: 'success',
      title: 'Scan started',
      message: 'Queued for scanning.',
    });
    dismiss(id);
    expect(toasts.value).toHaveLength(before);
  });
});
```

`apps/web/test/breadcrumbs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { breadcrumbsFor } from '../app/utils/breadcrumbs';

describe('breadcrumbsFor', () => {
  it('maps a findings route to labelled crumbs', () => {
    expect(breadcrumbsFor('/app/scans/scan-1/findings')).toEqual([
      { label: 'Overview', to: '/app' },
      { label: 'Scans', to: '/app/scans' },
      { label: 'scan-1', to: '/app/scans/scan-1' },
      { label: 'Findings' },
    ]);
  });

  it('maps remediation and coverage routes', () => {
    expect(breadcrumbsFor('/app/scans/scan-1/remediation').at(-1)).toEqual({ label: 'Remediation' });
    expect(breadcrumbsFor('/app/scans/scan-1/coverage').at(-1)).toEqual({ label: 'Coverage' });
    expect(breadcrumbsFor('/app/remediation').at(-1)).toEqual({ label: 'Remediation' });
  });
});
```

`apps/web/test/design-system.test.ts`:

```ts
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import DsScoreCard from '../app/components/ds/DsScoreCard.vue';
import DsBadge from '../app/components/ds/DsBadge.vue';

describe('design-system primitives', () => {
  it('never shows a score without coverage and findings link', async () => {
    const wrapper = await mountSuspended(DsScoreCard, {
      props: {
        score: 100,
        grade: 'A',
        coverage: 'full',
        findingsHref: '/app/scans/scan-1/findings',
      },
    });
    expect(wrapper.text()).toContain('100.0');
    expect(wrapper.text()).toContain('A');
    expect(wrapper.text()).toContain('coverage: full');
    expect(wrapper.find('a[href="/app/scans/scan-1/findings"]').exists()).toBe(true);
  });

  it('uses static Tailwind classes for badge tones', async () => {
    const wrapper = await mountSuspended(DsBadge, { props: { tone: 'high' }, slots: { default: 'High' } });
    expect(wrapper.classes().join(' ')).toContain('--color-risk-high-bg');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @dpdpa/web test -- test/use-toasts.test.ts test/breadcrumbs.test.ts test/design-system.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement store and utility**

`apps/web/app/types/toast.ts`:

```ts
export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  message: string;
}
```

`apps/web/app/composables/useToasts.ts`:

```ts
import { ref, type Ref } from 'vue';
import type { Toast, ToastTone } from '~/types/toast';

const toasts: Ref<Toast[]> = ref([]);
let sequence = 0;

export function useToasts() {
  function push(tone: ToastTone, title: string, message = ''): string {
    const id = `toast-${++sequence}`;
    toasts.value = [...toasts.value, { id, tone, title, message }];
    return id;
  }

  function dismiss(id: string): void {
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
  }

  return { toasts, push, dismiss };
}
```

`apps/web/app/utils/breadcrumbs.ts`:

```ts
export interface Crumb {
  label: string;
  to?: string;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function breadcrumbsFor(path: string): Crumb[] {
  const parts = path.split('/').filter(Boolean);
  if (parts[0] !== 'app') return [];

  const crumbs: Crumb[] = [{ label: 'Overview', to: '/app' }];
  if (parts.length === 1) return crumbs;

  if (parts[1] === 'scans') {
    crumbs.push({ label: 'Scans', to: '/app/scans' });
    if (parts[2]) crumbs.push({ label: parts[2], to: `/app/scans/${parts[2]}` });
    if (parts[3]) crumbs.push({ label: titleCase(parts[3]) });
    return crumbs;
  }

  crumbs.push({ label: titleCase(parts[1]), to: `/app/${parts[1]}` });
  return crumbs;
}
```

- [ ] **Step 4: Implement primitives**

`apps/web/app/components/ds/DsButton.vue`:

```vue
<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: 'primary' | 'ghost';
    type?: 'button' | 'submit';
    disabled?: boolean;
  }>(),
  {
    tone: 'primary',
    type: 'button',
    disabled: false,
  },
);
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    class="focus-visible:ring-brand-500 rounded-[var(--radius-control)] px-4 py-2 text-sm font-medium transition-[background-color,transform] duration-[var(--motion-fast)] ease-[var(--ease-out)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    :class="
      tone === 'primary'
        ? 'bg-brand-500 text-ink-50 hover:bg-brand-600'
        : 'border border-ink-200 bg-transparent text-ink-700 hover:bg-surface-raised'
    "
  >
    <slot />
  </button>
</template>
```

`apps/web/app/components/ds/DsCard.vue`:

```vue
<template>
  <section
    class="bg-surface rounded-[var(--radius-card)] p-4 shadow-[var(--shadow-card)] transition-shadow duration-[var(--motion-fast)] hover:shadow-[var(--shadow-popover)]"
  >
    <slot />
  </section>
</template>
```

`apps/web/app/components/ds/DsBadge.vue` — use an explicit static map so Tailwind sees every class:

```vue
<script setup lang="ts">
import type { FindingSeverity } from '~~/shared/findings';

withDefaults(defineProps<{ tone?: FindingSeverity | 'info' }>(), { tone: 'info' });

const TONE_CLASS: Record<FindingSeverity | 'info', string> = {
  critical: 'bg-[var(--color-risk-critical-bg)] text-[var(--color-risk-critical-text)]',
  high: 'bg-[var(--color-risk-high-bg)] text-[var(--color-risk-high-text)]',
  medium: 'bg-[var(--color-risk-medium-bg)] text-[var(--color-risk-medium-text)]',
  low: 'bg-[var(--color-risk-low-bg)] text-[var(--color-risk-low-text)]',
  info: 'bg-[var(--color-surface-raised)] text-[var(--color-ink-700)]',
};
</script>

<template>
  <span
    class="rounded-[var(--radius-pill)] px-2 py-0.5 font-mono text-xs"
    :class="TONE_CLASS[tone]"
  >
    <slot />
  </span>
</template>
```

`apps/web/app/components/ds/DsInput.vue`:

```vue
<script setup lang="ts">
defineProps<{ label: string; type?: string; placeholder?: string }>();
const model = defineModel<string>({ default: '' });
</script>

<template>
  <label class="block">
    <span class="text-ink-400 font-mono text-xs tracking-widest uppercase">{{ label }}</span>
    <input
      v-model="model"
      :type="type ?? 'text'"
      :placeholder="placeholder"
      class="bg-surface-raised text-ink-900 border-ink-300 focus-visible:ring-brand-500 mt-2 w-full rounded-[var(--radius-control)] border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
    />
  </label>
</template>
```

`apps/web/app/components/ds/DsSkeleton.vue`:

```vue
<template>
  <div class="bg-surface-raised animate-pulse rounded-[var(--radius-control)]" aria-hidden="true">
    <slot />
  </div>
</template>
```

`apps/web/app/components/ds/DsScoreCard.vue`:

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import DsBadge from './DsBadge.vue';

const props = defineProps<{
  score: number | null;
  grade: string | null;
  coverage: string;
  findingsHref: string;
}>();

const displayed = ref(props.score ?? 0);

onMounted(() => {
  const target = props.score ?? 0;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || target === 0) {
    displayed.value = target;
    return;
  }
  displayed.value = 0;
  const startedAt = performance.now();
  const tick = (now: number) => {
    const progress = Math.min((now - startedAt) / 500, 1);
    displayed.value = target * (1 - (1 - progress) ** 3);
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
</script>

<template>
  <div class="bg-surface rounded-[var(--radius-card)] p-4 shadow-[var(--shadow-card)]">
    <div class="flex items-end gap-4">
      <span class="text-ink-900 font-sans text-4xl leading-none font-semibold tabular-nums">
        {{ displayed.toFixed(1) }}
      </span>
      <DsBadge :tone="coverage === 'full' ? 'low' : 'medium'">{{ grade ?? '-' }}</DsBadge>
      <span class="text-ink-400 font-mono text-xs">coverage: {{ coverage }}</span>
    </div>
    <NuxtLink
      :to="findingsHref"
      class="text-brand-500 mt-3 inline-block font-mono text-xs hover:underline"
    >
      How was this score computed?
    </NuxtLink>
  </div>
</template>
```

`apps/web/app/components/ds/DsFindingRow.vue`:

```vue
<script setup lang="ts">
import type { FindingView } from '~~/shared/findings';
import DsBadge from './DsBadge.vue';

defineProps<{ finding: FindingView }>();
defineEmits<{ select: [finding: FindingView] }>();
</script>

<template>
  <button
    type="button"
    class="bg-surface hover:shadow-popover flex w-full items-start gap-3 rounded-[var(--radius-card)] p-3 text-left transition-shadow duration-[var(--motion-fast)]"
    @click="$emit('select', finding)"
  >
    <DsBadge :tone="finding.severity">{{ finding.severity }}</DsBadge>
    <span class="min-w-0 flex-1">
      <span class="text-ink-900 block text-sm">{{ finding.message }}</span>
      <span class="text-ink-400 mt-1 block font-mono text-xs">
        {{ finding.filePath }}:{{ finding.lineStart }} · {{ finding.evidence.hash }}
      </span>
    </span>
  </button>
</template>
```

`apps/web/app/components/ds/DsFilterChips.vue`:

```vue
<script setup lang="ts">
const props = defineProps<{ options: string[]; modelValue: string[] }>();
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>();

function toggle(option: string): void {
  const next = props.modelValue.includes(option)
    ? props.modelValue.filter((item) => item !== option)
    : [...props.modelValue, option];
  emit('update:modelValue', next);
}
</script>

<template>
  <div class="flex flex-wrap gap-2" role="group" aria-label="Filter findings">
    <button
      v-for="option in options"
      :key="option"
      type="button"
      class="border-ink-300 text-ink-400 rounded-[var(--radius-pill)] border px-3 py-1 font-mono text-xs aria-pressed:bg-brand-500 aria-pressed:text-ink-50"
      :aria-pressed="modelValue.includes(option)"
      @click="toggle(option)"
    >
      {{ option }}
    </button>
  </div>
</template>
```

`apps/web/app/components/ds/DsEmptyState.vue`:

```vue
<script setup lang="ts">
withDefaults(defineProps<{ title?: string; message?: string }>(), {
  title: 'Nothing here yet',
  message: '',
});
</script>

<template>
  <div class="bg-surface rounded-[var(--radius-card)] p-8 text-center">
    <p class="text-ink-900 text-sm font-medium">{{ title }}</p>
    <p v-if="message" class="text-ink-400 mt-2 text-sm">{{ message }}</p>
  </div>
</template>
```

`apps/web/app/components/ds/DsErrorState.vue`:

```vue
<script setup lang="ts">
withDefaults(defineProps<{ message?: string; requestId?: string }>(), {
  message: 'Something went wrong.',
  requestId: '',
});
defineEmits<{ retry: [] }>();
</script>

<template>
  <div role="alert" class="bg-risk-critical-bg rounded-[var(--radius-card)] p-4">
    <p class="text-risk-critical-text text-sm">{{ message }}</p>
    <p v-if="requestId" class="text-ink-400 mt-1 font-mono text-xs">ID {{ requestId }}</p>
    <DsButton class="mt-3" @click="$emit('retry')">Retry</DsButton>
  </div>
</template>
```

`apps/web/app/components/ds/DsToastHost.vue` — static tone classes are intentional:

```vue
<script setup lang="ts">
import { useToasts } from '~/composables/useToasts';

const { toasts, dismiss } = useToasts();

const TONE_CLASS: Record<string, string> = {
  success:
    'border-[var(--color-risk-low-border)] bg-[var(--color-risk-low-bg)] text-[var(--color-risk-low-text)]',
  error:
    'border-[var(--color-risk-critical-border)] bg-[var(--color-risk-critical-bg)] text-[var(--color-risk-critical-text)]',
  info: 'border-[var(--color-ink-300)] bg-[var(--color-surface-raised)] text-[var(--color-ink-800)]',
};
</script>

<template>
  <div class="fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2" role="status" aria-live="polite">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="rounded-[var(--radius-card)] border p-3 shadow-[var(--shadow-popover)]"
        :class="TONE_CLASS[toast.tone]"
      >
        <div class="flex items-start justify-between gap-2">
          <div>
            <p class="text-sm font-medium">{{ toast.title }}</p>
            <p v-if="toast.message" class="mt-1 text-xs opacity-80">{{ toast.message }}</p>
          </div>
          <button type="button" aria-label="Dismiss notification" @click="dismiss(toast.id)">
            ×
          </button>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity var(--motion-slow) var(--ease-out),
    transform var(--motion-slow) var(--ease-out);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
```

`apps/web/app/components/ds/DsBreadcrumb.vue`:

```vue
<script setup lang="ts">
import type { Crumb } from '~/utils/breadcrumbs';
defineProps<{ crumbs: Crumb[] }>();
</script>

<template>
  <nav aria-label="Breadcrumb" class="text-ink-400 flex items-center gap-2 font-mono text-xs">
    <template v-for="(crumb, index) in crumbs" :key="crumb.label">
      <span v-if="index > 0" aria-hidden="true">/</span>
      <NuxtLink v-if="crumb.to" :to="crumb.to" class="hover:text-brand-500">
        {{ crumb.label }}
      </NuxtLink>
      <span v-else aria-current="page">{{ crumb.label }}</span>
    </template>
  </nav>
</template>
```

`apps/web/app/components/ds/DsDrawer.vue`:

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';

defineProps<{ open: boolean; title: string }>();
const emit = defineEmits<{ close: [] }>();

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close');
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <Transition name="drawer">
    <div v-if="open" class="fixed inset-0 z-40 flex justify-end" role="dialog" :aria-label="title">
      <div class="absolute inset-0" :style="{ background: 'var(--color-overlay)' }" @click="emit('close')" />
      <div
        class="bg-surface-raised relative h-full w-full max-w-lg overflow-y-auto p-6 shadow-[var(--shadow-popover)]"
      >
        <div class="flex items-start justify-between gap-4">
          <h2 class="text-xl font-semibold">{{ title }}</h2>
          <button type="button" aria-label="Close drawer" @click="emit('close')">×</button>
        </div>
        <slot />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity var(--motion-slow) var(--ease-out);
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
</style>
```

- [ ] **Step 5: Run tests, lint, and typecheck**

Run: `pnpm --filter @dpdpa/web test -- test/use-toasts.test.ts test/breadcrumbs.test.ts test/design-system.test.ts; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; pnpm --filter @dpdpa/web typecheck; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; pnpm lint`
Expected: PASS; exit 0.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/app/types/toast.ts apps/web/app/composables/useToasts.ts apps/web/app/utils/breadcrumbs.ts apps/web/app/components/ds apps/web/test/use-toasts.test.ts apps/web/test/breadcrumbs.test.ts apps/web/test/design-system.test.ts
git commit -m "feat(web): add Signal Console primitives and toasts"
```

---

### Task 3: New shell, route transitions, breadcrumbs, and Playwright dev config

**Files:**
- Create: `apps/web/app/components/shell/NewAppShell.vue`
- Modify: `apps/web/app/app.vue`
- Modify: `apps/web/playwright.config.ts`
- Create: `apps/web/test/new-app-shell.test.ts`
- Create: `.playwright-mcp/frontend-verification.md`

**Interfaces:**
- Consumes: `DsBreadcrumb`, `DsToastHost`, `breadcrumbsFor`, `useRuntimeConfig().public.newUi`.
- Produces: `NewAppShell` used by `app.vue` when `newUi` is true.

- [ ] **Step 1: Write the failing shell test**

`apps/web/test/new-app-shell.test.ts`:

```ts
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import NewAppShell from '../app/components/shell/NewAppShell.vue';

describe('NewAppShell', () => {
  it('renders breadcrumb nav, main landmark, and toast host', async () => {
    const wrapper = await mountSuspended(NewAppShell);
    expect(wrapper.find('nav[aria-label="Breadcrumb"]').exists()).toBe(true);
    expect(wrapper.find('main#main').exists()).toBe(true);
    expect(wrapper.find('[aria-live="polite"]').exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @dpdpa/web test -- test/new-app-shell.test.ts`
Expected: FAIL with "Cannot find module '../app/components/shell/NewAppShell.vue'".

- [ ] **Step 3: Implement the new shell**

`apps/web/app/components/shell/NewAppShell.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import DsBreadcrumb from '~/components/ds/DsBreadcrumb.vue';
import DsToastHost from '~/components/ds/DsToastHost.vue';
import { breadcrumbsFor } from '~/utils/breadcrumbs';

const route = useRoute();
const crumbs = computed(() => breadcrumbsFor(route.path));

const NAV = [
  { label: 'Overview', to: '/app' },
  { label: 'Scans', to: '/app/scans' },
  { label: 'Remediation', to: '/app/remediation' },
  { label: 'Rules', to: '/app/rules' },
  { label: 'Audit', to: '/app/audit' },
  { label: 'Settings', to: '/app/settings/org' },
  { label: 'Health', to: '/health' },
] as const;
</script>

<template>
  <div class="bg-canvas text-ink-800 min-h-screen">
    <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50">
      Skip to content
    </a>
    <div class="flex min-h-screen">
      <aside class="bg-ink-50 w-60 shrink-0 p-4">
        <NuxtLink to="/app" class="text-brand-500 font-mono text-sm">DPDPA / CONSOLE</NuxtLink>
        <nav aria-label="Primary" class="mt-6 flex flex-col gap-1">
          <NuxtLink
            v-for="item in NAV"
            :key="item.to"
            :to="item.to"
            class="text-ink-400 hover:bg-surface-raised hover:text-ink-900 rounded-[var(--radius-control)] px-3 py-2 text-sm"
          >
            {{ item.label }}
          </NuxtLink>
        </nav>
      </aside>
      <div class="flex min-w-0 flex-1 flex-col">
        <header class="border-ink-200 bg-canvas border-b px-6 py-3">
          <DsBreadcrumb :crumbs="crumbs" />
        </header>
        <main id="main" tabindex="-1" class="min-w-0 flex-1 px-6 py-6">
          <Transition name="route" mode="out-in">
            <slot />
          </Transition>
        </main>
      </div>
    </div>
    <DsToastHost />
  </div>
</template>

<style scoped>
.route-enter-active,
.route-leave-active {
  transition:
    opacity var(--motion-base) var(--ease-out),
    transform var(--motion-base) var(--ease-out);
}
.route-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.route-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
```

Modify `apps/web/app/app.vue` so the existing font preload and loading indicator remain:

```vue
<script setup lang="ts">
import geistLatinUrl from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url';
import geistMonoLatinUrl from '@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2?url';
import NewAppShell from '~/components/shell/NewAppShell.vue';

const newUi = useRuntimeConfig().public.newUi;

useHead({
  link: [
    {
      rel: 'preload',
      href: geistLatinUrl,
      as: 'font',
      type: 'font/woff2',
      crossorigin: '',
    },
    {
      rel: 'preload',
      href: geistMonoLatinUrl,
      as: 'font',
      type: 'font/woff2',
      crossorigin: '',
    },
  ],
});
</script>

<template>
  <NuxtLoadingIndicator />
  <NewAppShell v-if="newUi">
    <NuxtPage />
  </NewAppShell>
  <NuxtLayout v-else>
    <NuxtPage />
  </NuxtLayout>
</template>
```

Modify `apps/web/playwright.config.ts`:

```ts
  webServer: {
    command: 'pnpm dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    env: {
      NUXT_FIXTURES: '1',
      ...(process.env.NUXT_PUBLIC_NEW_UI === '1' ? { NUXT_PUBLIC_NEW_UI: '1' } : {}),
    },
    timeout: 120_000,
  },
```

Create `.playwright-mcp/frontend-verification.md` with this header:

```md
# Frontend verification evidence

All screenshots are captured with Playwright against `pnpm dev` with `NUXT_PUBLIC_NEW_UI=1`.

| Screen | URL | Checks | Screenshot | Console errors | Result |
|---|---|---|---|---|---|
```

- [ ] **Step 4: Run gates and visible browser check**

Run: `pnpm --filter @dpdpa/web test -- test/new-app-shell.test.ts; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; pnpm --filter @dpdpa/web typecheck; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; pnpm lint`

Then start the dev server in the background:

```powershell
$env:TEMP='D:\worktrees\dpdp-auditor\p3-scan-ui\.tmp'; $env:TMP=$env:TEMP
$env:NUXT_PUBLIC_NEW_UI='1'; $env:NUXT_FIXTURES='1'; $env:ORCHESTRATOR_URL='http://localhost:3101'; $env:REDIS_URL='redis://localhost:6379'; $env:NUXT_PUBLIC_APP_URL='http://localhost:3000'
pnpm --filter @dpdpa/web dev
```

Use Playwright to open `http://localhost:3000/app`, assert `nav[aria-label="Breadcrumb"]` and `main#main` are visible, check the browser console for errors, and save `../../.playwright-mcp/rebuild-shell.png`. Append a row to `.playwright-mcp/frontend-verification.md`.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/app/components/shell/NewAppShell.vue apps/web/app/app.vue apps/web/playwright.config.ts apps/web/test/new-app-shell.test.ts .playwright-mcp/frontend-verification.md
git commit -m "feat(web): add flagged Signal Console shell"
```

---

### Task 4: Overview, scans list, and scan detail screens

**Files:**
- Create: `apps/web/app/components/new/NewOverview.vue`
- Create: `apps/web/app/components/new/NewScansList.vue`
- Create: `apps/web/app/components/new/NewScanDetail.vue`
- Modify: `apps/web/app/pages/app/index.vue`
- Modify: `apps/web/app/pages/app/scans/index.vue`
- Modify: `apps/web/app/pages/app/scans/[scanId]/index.vue`
- Create: `apps/web/test/new-scan-screens.test.ts`
- Create: `apps/web/e2e/new-shell.spec.ts`

**Interfaces:**
- Consumes: `DsCard`, `DsScoreCard`, `DsSkeleton`, `coverageFor`, `scanSections`, existing `/api/v1/*` responses.
- Produces: `NewOverview`, `NewScansList`, `NewScanDetail`.

- [ ] **Step 1: Write failing component tests**

`apps/web/test/new-scan-screens.test.ts`:

```ts
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import NewScanDetail from '../app/components/new/NewScanDetail.vue';

describe('NewScanDetail', () => {
  it('renders score, grade and coverage together', async () => {
    const wrapper = await mountSuspended(NewScanDetail, {
      props: {
        scan: {
          id: 'scn_1',
          status: 'completed',
          score: 100,
          grade: 'A',
          coverage: 'full',
          repository: 'acme/repo',
        },
      },
    });
    expect(wrapper.text()).toContain('100.0');
    expect(wrapper.text()).toContain('A');
    expect(wrapper.text()).toContain('coverage: full');
    expect(wrapper.findAll('h1')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @dpdpa/web test -- test/new-scan-screens.test.ts`
Expected: FAIL with "Cannot find module '../app/components/new/NewScanDetail.vue'".

- [ ] **Step 3: Implement the scan components**

`apps/web/app/components/new/NewOverview.vue`:

```vue
<script setup lang="ts">
import DsCard from '~/components/ds/DsCard.vue';
defineProps<{ stats: { label: string; value: string | number }[] }>();
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold">Overview</h1>
    <div class="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <DsCard v-for="stat in stats" :key="stat.label">
        <p class="text-ink-400 font-mono text-xs">{{ stat.label }}</p>
        <p class="text-ink-900 mt-2 text-2xl font-semibold tabular-nums">{{ stat.value }}</p>
      </DsCard>
    </div>
  </div>
</template>
```

`apps/web/app/components/new/NewScansList.vue`:

```vue
<script setup lang="ts">
import DsCard from '~/components/ds/DsCard.vue';
import DsSkeleton from '~/components/ds/DsSkeleton.vue';

defineProps<{
  scans: { id: string; repository: string; status: string; score: number | null }[];
  loading?: boolean;
}>();
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold">Scans</h1>
    <DsSkeleton v-if="loading" class="mt-6 h-24" />
    <p v-else-if="scans.length === 0" class="text-ink-400 mt-6 text-sm">No scans found.</p>
    <div v-else class="mt-6 grid gap-3">
      <DsCard v-for="scan in scans" :key="scan.id">
        <NuxtLink :to="`/app/scans/${scan.id}`" class="flex items-center justify-between gap-4">
          <span class="text-ink-900 text-sm">{{ scan.repository }}</span>
          <span class="text-ink-400 font-mono text-xs">
            {{ scan.status }} · {{ scan.score === null ? '—' : scan.score.toFixed(1) }}
          </span>
        </NuxtLink>
      </DsCard>
    </div>
  </div>
</template>
```

`apps/web/app/components/new/NewScanDetail.vue`:

```vue
<script setup lang="ts">
import DsBadge from '~/components/ds/DsBadge.vue';
import DsCard from '~/components/ds/DsCard.vue';
import DsSkeleton from '~/components/ds/DsSkeleton.vue';
import DsScoreCard from '~/components/ds/DsScoreCard.vue';

interface ScanView {
  id: string;
  status: string;
  score: number | null;
  grade: string | null;
  coverage: string;
  repository: string;
  note?: string | null;
}

const props = defineProps<{ scan: ScanView | null; loading?: boolean }>();
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold">{{ scan?.repository ?? 'Scan' }}</h1>
    <DsSkeleton v-if="loading || scan === null" class="mt-6 h-32" />
    <template v-else>
      <DsScoreCard
        class="mt-6"
        :score="scan.score"
        :grade="scan.grade"
        :coverage="scan.coverage"
        :findings-href="`/app/scans/${scan.id}/findings`"
      />
      <DsCard class="mt-4">
        <div class="flex flex-wrap items-center gap-3">
          <DsBadge tone="info">{{ scan.status }}</DsBadge>
          <NuxtLink
            :to="`/app/scans/${scan.id}/coverage`"
            class="text-brand-500 font-mono text-xs hover:underline"
          >
            Score and coverage breakdown
          </NuxtLink>
          <NuxtLink
            :to="`/app/scans/${scan.id}/remediation`"
            class="text-brand-500 font-mono text-xs hover:underline"
          >
            Remediation workspace
          </NuxtLink>
        </div>
        <p v-if="scan.note" class="text-risk-medium-text mt-3 text-sm">{{ scan.note }}</p>
      </DsCard>
    </template>
  </div>
</template>
```

- [ ] **Step 4: Wire the pages behind the flag**

For each page below, add `const newUi = useRuntimeConfig().public.newUi;` inside `<script setup>` and wrap the **existing** page markup in `<div v-else>...</div>`. Add the new component branch immediately before it.

`apps/web/app/pages/app/index.vue`:

```vue
<NewOverview v-if="newUi" :stats="KPIS.map((item) => ({ ...item, value: String(item.value) }))" />
<div v-else>
  <!-- existing markup unchanged -->
</div>
```

`apps/web/app/pages/app/scans/index.vue`:

```vue
<NewScansList
  v-if="newUi"
  :scans="items.map((item) => ({
    id: item.id,
    repository: item.repositoryFullName,
    status: item.status,
    score: item.score,
  }))"
  :loading="loadingPage"
/>
<div v-else>
  <!-- existing markup unchanged -->
</div>
```

`apps/web/app/pages/app/scans/[scanId]/index.vue` — add imports `coverageFor` is already present and use the existing `coverage` and `scan` computeds:

```vue
<NewScanDetail
  v-if="newUi"
  :loading="status === 'pending'"
  :scan="scan === null ? null : {
    id: scan.id,
    status: scan.status,
    score: scan.score,
    grade: scan.grade,
    coverage: scan.status === 'completed' ? coverage.state : 'not scored',
    repository: scan.repository.fullName,
    note: coverage.note,
  }"
/>
<div v-else>
  <!-- existing markup unchanged -->
</div>
```

- [ ] **Step 5: Add Playwright verification**

`apps/web/e2e/new-shell.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const SCAN_ID = '0f000000-0000-4000-8000-000000000010';

test.describe('Signal Console shell', () => {
  test('overview renders the new shell and can be screenshotted', async ({ page }) => {
    await page.goto('/app');
    await expect(page.locator('nav[aria-label="Breadcrumb"]')).toBeVisible();
    await expect(page.locator('main h1')).toHaveText('Overview');
    await page.screenshot({ path: '../../.playwright-mcp/rebuild-overview.png', fullPage: true });
  });

  test('scans list renders score and status together', async ({ page }) => {
    await page.goto('/app/scans');
    await expect(page.locator('main h1')).toHaveText('Scans');
    await page.screenshot({ path: '../../.playwright-mcp/rebuild-scans.png', fullPage: true });
  });

  test('scan detail shows score with coverage and grade', async ({ page }) => {
    await page.goto(`/app/scans/${SCAN_ID}`);
    await expect(page.locator('main')).toContainText('coverage:');
    await expect(page.locator('main')).toContainText('Score and coverage breakdown');
    await page.screenshot({ path: '../../.playwright-mcp/rebuild-scan-detail.png', fullPage: true });
  });

  test('motion collapses under prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/app');
    const duration = await page.locator('main').evaluate((element) => getComputedStyle(element).transitionDuration);
    expect(duration).toMatch(/0\.00001s|0s|0\.01ms/);
  });
});
```

- [ ] **Step 6: Run tests and e2e**

```powershell
$env:TEMP='D:\worktrees\dpdp-auditor\p3-scan-ui\.tmp'; $env:TMP=$env:TEMP
$env:NUXT_PUBLIC_NEW_UI='1'
pnpm --filter @dpdpa/web test -- test/new-scan-screens.test.ts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
pnpm --filter @dpdpa/web exec playwright test e2e/new-shell.spec.ts
```

Expected: PASS; screenshots written under `.playwright-mcp/`. Append three rows to `.playwright-mcp/frontend-verification.md` with console-error results.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/app/components/new apps/web/app/pages/app apps/web/test/new-scan-screens.test.ts apps/web/e2e/new-shell.spec.ts .playwright-mcp
git commit -m "feat(web): rebuild overview and scan screens"
```

---

### Task 5: Findings workspace, remediation workspace, and remediation index

**Files:**
- Create: `apps/web/app/components/new/NewFindings.vue`
- Create: `apps/web/app/components/new/RemediationWorkspace.vue`
- Create: `apps/web/app/components/new/NewRemediationIndex.vue`
- Modify: `apps/web/app/pages/app/scans/[scanId]/findings.vue`
- Create: `apps/web/app/pages/app/scans/[scanId]/remediation.vue`
- Create: `apps/web/app/pages/app/remediation/index.vue`
- Create: `apps/web/test/new-findings.test.ts`
- Modify: `apps/web/e2e/a11y.spec.ts`

**Interfaces:**
- Consumes: `FindingView`, `FindingsPage`, `ScanListPage`, `DsFindingRow`, `DsFilterChips`, `DsDrawer`, `DsButton`, `useToasts`.
- Produces: `NewFindings({ findings: FindingView[] })`, `RemediationWorkspace({ findings: FindingView[] })`, `NewRemediationIndex({ scans })`.
- Status-only remediation: real `PATCH /api/v1/findings/:id` calls; no assignee UI.

- [ ] **Step 1: Write failing test**

`apps/web/test/new-findings.test.ts`:

```ts
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import type { FindingView } from '~~/shared/findings';
import NewFindings from '../app/components/new/NewFindings.vue';

const finding = {
  id: 'fnd_1',
  severity: 'high',
  message: 'Root container user',
  filePath: 'Dockerfile',
  lineStart: 29,
  evidence: { hash: 'sha256:abc' },
} as unknown as FindingView;

describe('NewFindings', () => {
  it('renders severity, location and evidence hash', async () => {
    const wrapper = await mountSuspended(NewFindings, { props: { findings: [finding] } });
    expect(wrapper.text()).toContain('Root container user');
    expect(wrapper.text()).toContain('Dockerfile:29');
    expect(wrapper.text()).toContain('sha256:abc');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @dpdpa/web test -- test/new-findings.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement findings, remediation, and index components**

`apps/web/app/components/new/NewFindings.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import DsCard from '~/components/ds/DsCard.vue';
import DsDrawer from '~/components/ds/DsDrawer.vue';
import DsFilterChips from '~/components/ds/DsFilterChips.vue';
import DsFindingRow from '~/components/ds/DsFindingRow.vue';
import type { FindingSeverity, FindingView } from '~~/shared/findings';

const props = defineProps<{ findings: FindingView[] }>();
const route = useRoute();

const SEVERITIES: FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
const active = ref<FindingSeverity[]>([]);
const selected = ref<FindingView | null>(null);

const visible = computed(() =>
  active.value.length === 0
    ? props.findings
    : props.findings.filter((finding) => active.value.includes(finding.severity)),
);
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold">Findings</h1>
    <DsFilterChips v-model="active" :options="SEVERITIES" class="mt-4" />
    <div class="mt-4 grid gap-2">
      <div
        v-for="(finding, index) in visible.slice(0, 20)"
        :key="finding.id"
        :style="{ transitionDelay: `${Math.min(index, 19) * 20}ms` }"
        class="transition-[transform,opacity] duration-[var(--motion-base)] ease-[var(--ease-out)]"
      >
        <DsFindingRow :finding="finding" @select="selected = $event" />
      </div>
      <p v-if="visible.length === 0" class="text-ink-400 mt-4 text-sm">No findings match these filters.</p>
    </div>
    <DsDrawer
      :open="selected !== null"
      :title="selected?.message ?? ''"
      @close="selected = null"
    >
      <template v-if="selected">
        <p class="text-ink-400 font-mono text-xs">{{ selected.severity }} · {{ selected.evidence.hash }}</p>
        <p class="mt-4 text-sm">{{ selected.remediation?.summary ?? 'Review this finding.' }}</p>
        <NuxtLink
          :to="`/app/scans/${route.params.scanId}/remediation?finding=${selected.id}`"
          class="text-brand-500 mt-6 inline-block font-mono text-xs hover:underline"
        >
          Open remediation workspace
        </NuxtLink>
      </template>
    </DsDrawer>
  </div>
</template>
```

`apps/web/app/components/new/RemediationWorkspace.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import DsBadge from '~/components/ds/DsBadge.vue';
import DsButton from '~/components/ds/DsButton.vue';
import DsCard from '~/components/ds/DsCard.vue';
import DsDrawer from '~/components/ds/DsDrawer.vue';
import DsInput from '~/components/ds/DsInput.vue';
import { useToasts } from '~/composables/useToasts';
import type { FindingStatus, FindingView } from '~~/shared/findings';

const props = defineProps<{ findings: FindingView[] }>();
const emit = defineEmits<{ triaged: [] }>();

const STATUS_OPTIONS: FindingStatus[] = ['open', 'false_positive', 'accepted_risk', 'fixed', 'reopened'];
const selected = ref<FindingView | null>(null);
const status = ref<FindingStatus>('open');
const note = ref('');
const pending = ref(false);
const { push } = useToasts();

const openCount = computed(() => props.findings.filter((finding) => finding.status === 'open').length);

function select(finding: FindingView): void {
  selected.value = finding;
  status.value = finding.status;
  note.value = '';
}

async function save(): Promise<void> {
  if (selected.value === null) return;
  const id = selected.value.id;
  pending.value = true;
  try {
    await $fetch(`/api/v1/findings/${id}`, {
      method: 'PATCH',
      body: { status: status.value, ...(note.value.trim() === '' ? {} : { note: note.value.trim() }) },
    });
    push('success', 'Finding triaged', `${id} → ${status.value}`);
    selected.value = null;
    emit('triaged');
  } catch (cause) {
    const message = (cause as { data?: { error?: { message?: string } } }).data?.error?.message;
    push('error', 'Triage failed', message ?? 'The disposition could not be saved.');
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold">Remediation workspace</h1>
    <p class="text-ink-400 mt-2 font-mono text-xs">{{ openCount }} open · status-only triage</p>
    <div class="mt-6 grid gap-2">
      <DsCard v-for="finding in findings" :key="finding.id">
        <button type="button" class="flex w-full items-center gap-3 text-left" @click="select(finding)">
          <DsBadge :tone="finding.severity">{{ finding.severity }}</DsBadge>
          <span class="text-ink-900 flex-1 text-sm">{{ finding.message }}</span>
          <span class="text-ink-400 font-mono text-xs">{{ finding.status }}</span>
        </button>
      </DsCard>
      <p v-if="findings.length === 0" class="text-ink-400 text-sm">No findings to triage.</p>
    </div>
    <DsDrawer
      :open="selected !== null"
      :title="selected?.message ?? ''"
      @close="selected = null"
    >
      <template v-if="selected">
        <p class="text-ink-400 font-mono text-xs">
          {{ selected.filePath }}:{{ selected.lineStart }} · {{ selected.evidence.hash }}
        </p>
        <p class="mt-4 text-sm">{{ selected.remediation?.summary ?? 'Review this finding.' }}</p>
        <ol v-if="selected.remediation?.steps.length" class="text-ink-400 mt-3 list-decimal pl-5 text-sm">
          <li v-for="step in selected.remediation.steps" :key="step">{{ step }}</li>
        </ol>
        <label class="mt-6 block">
          <span class="text-ink-400 font-mono text-xs uppercase">Status</span>
          <select v-model="status" class="bg-surface-raised text-ink-900 mt-2 w-full rounded-[var(--radius-control)] border border-ink-300 px-3 py-2 text-sm">
            <option v-for="option in STATUS_OPTIONS" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>
        <DsInput v-model="note" label="Triage note" class="mt-4" />
        <DsButton class="mt-6" :disabled="pending" @click="save">
          {{ pending ? 'Saving…' : 'Save disposition' }}
        </DsButton>
      </template>
    </DsDrawer>
  </div>
</template>
```

Note: add a `disabled?: boolean` prop to `DsButton` in Task 2 if not already present; bind it to the native button.

`apps/web/app/components/new/NewRemediationIndex.vue`:

```vue
<script setup lang="ts">
import DsCard from '~/components/ds/DsCard.vue';
defineProps<{ scans: { id: string; repository: string; status: string }[] }>();
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold">Remediation</h1>
    <p class="text-ink-400 mt-2 text-sm">Choose a completed scan to triage its findings.</p>
    <div class="mt-6 grid gap-2">
      <DsCard v-for="scan in scans" :key="scan.id">
        <NuxtLink :to="`/app/scans/${scan.id}/remediation`" class="flex justify-between gap-4">
          <span class="text-sm">{{ scan.repository }}</span>
          <span class="text-ink-400 font-mono text-xs">{{ scan.status }}</span>
        </NuxtLink>
      </DsCard>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Wire the pages**

In `apps/web/app/pages/app/scans/[scanId]/findings.vue`, add the flag branch while preserving the existing `useFindingsQuery` call and triage logic:

```vue
<script setup lang="ts">
const newUi = useRuntimeConfig().public.newUi;
// existing code unchanged
</script>

<template>
  <NewFindings v-if="newUi" :findings="findings" />
  <div v-else>
    <!-- existing markup unchanged -->
  </div>
</template>
```

Create `apps/web/app/pages/app/scans/[scanId]/remediation.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import RemediationWorkspace from '~/components/new/RemediationWorkspace.vue';
import type { FindingsPage } from '~~/shared/findings';

definePageMeta({ layout: 'app' });

const route = useRoute();
const scanId = computed(() => String(route.params.scanId));
const { data, refresh } = await useFetch<FindingsPage>(() =>
  `/api/v1/scan/${scanId.value}/findings?page=1&pageSize=100`,
);
const findings = computed(() => data.value?.data ?? []);
const loading = ref(false);
</script>

<template>
  <RemediationWorkspace :findings="findings" @triaged="refresh" />
</template>
```

`RemediationWorkspace` owns the only `h1`; do not add another heading to this page.

Create `apps/web/app/pages/app/remediation/index.vue`:

```vue
<script setup lang="ts">
import NewRemediationIndex from '~/components/new/NewRemediationIndex.vue';
import type { ScanListPage } from '~~/shared/scan';

definePageMeta({ layout: 'app' });

const { data } = await useFetch<{ data: ScanListPage }>('/api/v1/scans?page=1');
const scans = computed(() =>
  (data.value?.data.items ?? []).map((scan) => ({
    id: scan.id,
    repository: scan.repositoryFullName,
    status: scan.status,
  })),
);
</script>

<template>
  <NewRemediationIndex :scans="scans" />
</template>
```

Add `/app/scans/{id}/findings`, `/app/scans/{id}/coverage`, `/app/scans/{id}/remediation`, and `/app/remediation` to `PUBLIC_PATHS` in `apps/web/e2e/a11y.spec.ts` using the fixture scan ID.

- [ ] **Step 5: Run tests and browser verification**

```powershell
$env:TEMP='D:\worktrees\dpdp-auditor\p3-scan-ui\.tmp'; $env:TMP=$env:TEMP
$env:NUXT_PUBLIC_NEW_UI='1'
pnpm --filter @dpdpa/web test -- test/new-findings.test.ts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
pnpm --filter @dpdpa/web exec playwright test e2e/a11y.spec.ts
```

Also open `/app/scans/{fixture}/findings` with Playwright, open a finding drawer, save `../../.playwright-mcp/rebuild-findings.png`, and append the evidence row.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/app/components/new apps/web/app/pages/app apps/web/test/new-findings.test.ts apps/web/e2e/a11y.spec.ts .playwright-mcp
git commit -m "feat(web): rebuild findings and add remediation workspace"
```

---

### Task 6: Score/Coverage drill-down screen

**Files:**
- Create: `apps/web/app/components/new/ScoreCoverageDrilldown.vue`
- Create: `apps/web/app/pages/app/scans/[scanId]/coverage.vue`
- Create: `apps/web/test/score-coverage.test.ts`
- Modify: `apps/web/e2e/new-shell.spec.ts`

**Interfaces:**
- Consumes: `DsCard`, `DsBadge`, `/api/v1/scan/:scanId`, `/api/v1/scan/:scanId/findings`, `scanSections`, `SECTION_LABELS`, `coverageFor`.
- Produces: `ScoreCoverageDrilldown({ score, grade, coverage, sections, findings })`.

- [ ] **Step 1: Write failing test**

`apps/web/test/score-coverage.test.ts`:

```ts
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import ScoreCoverageDrilldown from '../app/components/new/ScoreCoverageDrilldown.vue';

describe('ScoreCoverageDrilldown', () => {
  it('explains section weights and contributing findings', async () => {
    const wrapper = await mountSuspended(ScoreCoverageDrilldown, {
      props: {
        score: 100,
        grade: 'A',
        coverage: 'full',
        sections: [{ code: '8(4)', title: 'Security safeguards', score: 100 }],
        findings: [{ id: 'fnd_1', severity: 'high', message: 'Root user' }],
      },
    });
    expect(wrapper.text()).toContain('8(4)');
    expect(wrapper.text()).toContain('Root user');
    expect(wrapper.text()).toContain('100.0');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @dpdpa/web test -- test/score-coverage.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement drill-down**

`apps/web/app/components/new/ScoreCoverageDrilldown.vue`:

```vue
<script setup lang="ts">
import DsBadge from '~/components/ds/DsBadge.vue';
import DsCard from '~/components/ds/DsCard.vue';
import type { FindingSeverity } from '~~/shared/findings';

defineProps<{
  score: number | null;
  grade: string | null;
  coverage: string;
  sections: { code: string; title: string; score: number | null }[];
  findings: { id: string; severity: FindingSeverity; message: string }[];
  coverageNote?: string | null;
}>();
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold">Score and coverage</h1>
    <DsCard class="mt-6">
      <div class="flex items-end gap-4">
        <span class="text-ink-900 text-4xl leading-none font-semibold tabular-nums">
          {{ score === null ? '—' : score.toFixed(1) }}
        </span>
        <DsBadge :tone="coverage === 'full' ? 'low' : 'medium'">{{ grade ?? '-' }}</DsBadge>
        <span class="text-ink-400 font-mono text-xs">coverage: {{ coverage }}</span>
      </div>
      <p v-if="coverageNote" class="text-risk-medium-text mt-3 text-sm">{{ coverageNote }}</p>
    </DsCard>
    <h2 class="mt-8 text-xl font-semibold">Section scores</h2>
    <div class="mt-3 grid gap-2">
      <DsCard v-for="section in sections" :key="section.code">
        <div class="flex justify-between gap-4">
          <span class="font-mono text-xs">{{ section.code }} · {{ section.title }}</span>
          <span class="tabular-nums">{{ section.score === null ? '—' : section.score.toFixed(1) }}</span>
        </div>
      </DsCard>
      <p v-if="sections.length === 0" class="text-ink-400 text-sm">No section scores yet.</p>
    </div>
    <h2 class="mt-8 text-xl font-semibold">Contributing findings</h2>
    <div class="mt-3 grid gap-2">
      <DsCard v-for="finding in findings" :key="finding.id">
        <DsBadge :tone="finding.severity">{{ finding.severity }}</DsBadge>
        <span class="ml-3 text-sm">{{ finding.message }}</span>
      </DsCard>
      <p v-if="findings.length === 0" class="text-ink-400 text-sm">No findings contributed to this score.</p>
    </div>
  </div>
</template>
```

Create `apps/web/app/pages/app/scans/[scanId]/coverage.vue`:

```vue
<script setup lang="ts">
import ScoreCoverageDrilldown from '~/components/new/ScoreCoverageDrilldown.vue';
import type { FindingsPage, FindingView } from '~~/shared/findings';
import {
  coverageFor,
  scanSections,
  SECTION_LABELS,
  type ScanDetail,
} from '~~/shared/scan';

definePageMeta({ layout: 'app' });

const route = useRoute();
const scanId = computed(() => String(route.params.scanId));
const { data: scanData } = await useFetch<{ data: ScanDetail }>(() => `/api/v1/scan/${scanId.value}`);
const { data: findingsData } = await useFetch<FindingsPage>(() =>
  `/api/v1/scan/${scanId.value}/findings?page=1&pageSize=100`,
);

const scan = computed(() => scanData.value?.data ?? null);
const assessment = computed(() =>
  scan.value === null ? { state: 'partial', note: null } : coverageFor(scan.value.coverage),
);
const sections = computed(() =>
  scan.value === null
    ? []
    : scanSections(scan.value.sectionScores).map((row) => ({
        code: row.section,
        title: SECTION_LABELS[row.section] ?? row.section,
        score: row.score,
      })),
);
const findings = computed(() =>
  (findingsData.value?.data ?? []).map((finding: FindingView) => ({
    id: finding.id,
    severity: finding.severity,
    message: finding.message,
  })),
);
</script>

<template>
  <ScoreCoverageDrilldown
    :score="scan?.score ?? null"
    :grade="scan?.grade ?? null"
    :coverage="assessment.state"
    :coverage-note="assessment.note"
    :sections="sections"
    :findings="findings"
  />
</template>
```

- [ ] **Step 4: Verify and commit**

Add to `apps/web/e2e/new-shell.spec.ts`:

```ts
test('coverage explains the score', async ({ page }) => {
  await page.goto(`/app/scans/${SCAN_ID}/coverage`);
  await expect(page.locator('main h1')).toHaveText('Score and coverage');
  await expect(page.locator('main')).toContainText('Section scores');
  await page.screenshot({ path: '../../.playwright-mcp/rebuild-coverage.png', fullPage: true });
});
```

Run:

```powershell
$env:TEMP='D:\worktrees\dpdp-auditor\p3-scan-ui\.tmp'; $env:TMP=$env:TEMP
$env:NUXT_PUBLIC_NEW_UI='1'
pnpm --filter @dpdpa/web test -- test/score-coverage.test.ts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
pnpm --filter @dpdpa/web typecheck
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
pnpm --filter @dpdpa/web exec playwright test e2e/new-shell.spec.ts
```

```powershell
git add apps/web/app/components/new/ScoreCoverageDrilldown.vue apps/web/app/pages/app/scans apps/web/test/score-coverage.test.ts apps/web/e2e/new-shell.spec.ts .playwright-mcp
git commit -m "feat(web): add score and coverage drill-down"
```

---

### Task 7: Remaining screens and full web-suite gate

**Files:**
- Create: `apps/web/app/components/new/NewReport.vue`
- Create: `apps/web/app/components/new/NewRules.vue`
- Create: `apps/web/app/components/new/NewAudit.vue`
- Create: `apps/web/app/components/new/NewSettings.vue`
- Create: `apps/web/app/components/new/NewHealth.vue`
- Modify corresponding page files to branch on `newUi`
- Create: `apps/web/test/new-remaining-screens.test.ts`

**Interfaces:**
- Consumes: `DownloadButton`, `DsCard`, `DsEmptyState`, `DsErrorState`, `DsBadge`, existing report/rules/audit/settings/health endpoints.
- Produces: five components with one `h1` each and explicit loading/empty/error states.

- [ ] **Step 1: Write failing test**

`apps/web/test/new-remaining-screens.test.ts`:

```ts
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import NewReport from '../app/components/new/NewReport.vue';
import NewRules from '../app/components/new/NewRules.vue';

describe('remaining rebuilt screens', () => {
  it('renders one h1 on report and rules screens', async () => {
    const report = await mountSuspended(NewReport, { props: { scanId: 'scan_1', canExport: true } });
    const rules = await mountSuspended(NewRules, { props: { rules: [] } });
    expect(report.findAll('h1')).toHaveLength(1);
    expect(rules.findAll('h1')).toHaveLength(1);
    expect(rules.text()).toContain('No rules found');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @dpdpa/web test -- test/new-remaining-screens.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement the five components**

`NewReport.vue` reuses the real PDF flow rather than a toast-only stub:

```vue
<script setup lang="ts">
import DownloadButton from '~/components/report/DownloadButton.vue';
import DsCard from '~/components/ds/DsCard.vue';

defineProps<{ scanId: string; canExport?: boolean }>();
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold">Report</h1>
    <DsCard class="mt-6">
      <p class="text-ink-400 font-mono text-xs">PDF export for scan {{ scanId }}</p>
      <DownloadButton class="mt-4" :scan-id="scanId" :can-export="canExport ?? true" />
    </DsCard>
  </div>
</template>
```

`NewRules.vue`:

```vue
<script setup lang="ts">
import DsCard from '~/components/ds/DsCard.vue';
import DsEmptyState from '~/components/ds/DsEmptyState.vue';

defineProps<{ rules: { code: string; title: string }[]; loading?: boolean; error?: string | null }>();
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold">Rules</h1>
    <DsEmptyState v-if="!loading && !error && rules.length === 0" title="No rules found" class="mt-6" />
    <p v-else-if="loading" class="text-ink-400 mt-6 text-sm">Loading rules…</p>
    <p v-else-if="error" role="alert" class="text-risk-critical-text mt-6 text-sm">{{ error }}</p>
    <div v-else class="mt-6 grid gap-2">
      <DsCard v-for="rule in rules" :key="rule.code">
        <span class="font-mono text-xs">{{ rule.code }}</span>
        <p class="mt-1 text-sm">{{ rule.title }}</p>
      </DsCard>
    </div>
  </div>
</template>
```

`NewAudit.vue`, `NewSettings.vue`, and `NewHealth.vue` follow the same pattern: one `h1`, `loading`, `error`, `DsEmptyState` for empty data, and `DsCard` rows. Use these props:

```ts
// NewAudit
defineProps<{ events: { id: string; action: string; createdAt: string }[]; loading?: boolean; error?: string | null }>();

// NewSettings
defineProps<{ orgName: string; loading?: boolean; error?: string | null }>();

// NewHealth
defineProps<{ services: { name: string; healthy: boolean }[]; loading?: boolean; error?: string | null }>();
```

- [ ] **Step 4: Wire pages**

Add `newUi` branches to the report, rules, audit, org settings, and health pages, passing each page's existing data. Do not remove old markup yet. The report page should pass its `scanId` from the report view model; if the route is `/report/:reportId`, use the existing report view model's `scan.id` once loaded and render `DsSkeleton` while pending.

- [ ] **Step 5: Run full web gate and e2e**

```powershell
$env:TEMP='D:\worktrees\dpdp-auditor\p3-scan-ui\.tmp'; $env:TMP=$env:TEMP
$env:NUXT_PUBLIC_NEW_UI='1'
pnpm --filter @dpdpa/web test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
pnpm --filter @dpdpa/web typecheck
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
pnpm lint
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
pnpm --filter @dpdpa/web exec playwright test
```

Expected: all exit 0; screenshots for every screen under `.playwright-mcp/`. Append evidence rows.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/app/components/new apps/web/app/pages apps/web/test/new-remaining-screens.test.ts .playwright-mcp
git commit -m "feat(web): rebuild report, rules, audit, settings and health screens"
```

---

### Task 8: Remove legacy code, final regression, and evidence

**Files:**
- Delete confirmed-unused legacy files under `apps/web/app/components/glass/` and legacy shell components.
- Modify: `apps/web/app/app.vue`, `apps/web/nuxt.config.ts`, `apps/web/app/utils/nav.ts`
- Modify: `apps/web/test/app-layout.test.ts`
- Update: `.playwright-mcp/frontend-verification.md`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: flag-free app; final verification evidence.

- [ ] **Step 1: Remove the flag and legacy branches**

In `apps/web/app/app.vue`, keep font preload and `NuxtLoadingIndicator` but render only:

```vue
<NewAppShell>
  <NuxtPage />
</NewAppShell>
```

Delete `newUi` from `runtimeConfig.public` in `apps/web/nuxt.config.ts`. Remove every `newUi` branch from pages, keeping the new component and deleting old markup. Add `Remediation` and `Coverage` entries to `apps/web/app/utils/nav.ts` if nav labels are used by the new shell.

- [ ] **Step 2: Delete confirmed-unused legacy files**

Run: `grep -R "AppSidebar\|AppTopbar\|PageHeader\|GlassCard\|UsageMeter\|CommandPalette" apps/web/app apps/web/test`
Expected: only references inside files scheduled for deletion. Delete only files with no remaining references.

- [ ] **Step 3: Update tests**

Rewrite `apps/web/test/app-layout.test.ts` to mount `NewAppShell` and assert skip link, main landmark, one `h1` from a test slot, breadcrumb nav, and toast host. Keep all API and fixture tests.

- [ ] **Step 4: Full regression**

```powershell
$env:TEMP='D:\worktrees\dpdp-auditor\p3-scan-ui\.tmp'; $env:TMP=$env:TEMP
pnpm lint
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
pnpm typecheck
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
pnpm test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
pnpm build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
pnpm security:audit
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$baseline = [int](Get-Content '.playwright-mcp/bundle-baseline.txt' -Raw)
$current = (Get-ChildItem 'apps/web/.output/public/_nuxt' -Recurse -File | Measure-Object Length -Sum).Sum
if ($current -gt ($baseline * 1.10)) { throw "Bundle grew from $baseline to $current bytes (>10%)." }
```

Expected: all exit 0. The known dev-only `picomatch` advisory remains ignored per the approved spec.

- [ ] **Step 5: Visible browser verification and real flow**

Start the dev server with `$env:NUXT_FIXTURES='1'` and no `NUXT_PUBLIC_NEW_UI`. Use Playwright to:

1. Open every rebuilt screen listed in the spec, assert the DOM, and check console errors.
2. Save a screenshot per screen under `.playwright-mcp/`.
3. Run a short full scan-to-report walkthrough and save `../../.playwright-mcp/rebuild-walkthrough.webm`.
4. Confirm the real PDF download endpoint still returns bytes with the expected SHA-256 when run against the existing verified scan fixtures.
5. Fill `.playwright-mcp/frontend-verification.md` with screen, URL, checks, screenshot path, console errors, and result.

- [ ] **Step 6: Final commit**

```powershell
git add -A
git commit -m "refactor(web): complete Signal Console frontend rebuild"
```

---

## Self-review notes

- Every spec requirement maps to a task: tokens/flag/baseline → T1, all named primitives/toasts/breadcrumbs → T2, shell/transitions → T3, existing screens → T4/T7, two new screens → T5/T6, motion/reduced-motion → T1/T2/T3/T5, Playwright evidence → T3-T8, rollback cleanup → T8.
- The plan avoids dynamic Tailwind arbitrary class names by using explicit static class maps.
- The plan preserves the existing font preload and loading indicator in `app.vue`.
- The plan uses real API shapes from `shared/scan.ts` and `shared/findings.ts` (`coverageFor`, `sectionScores`, `finding.evidence.hash`, `FindingsPage.data`), not invented fields.
- The plan uses `pnpm dev` and PowerShell env syntax, not `pnpm preview` or Unix-only inline env assignments.
- Playwright screenshot paths are relative to `apps/web` and resolve to the repository-root `.playwright-mcp`.
- The Remediation workspace uses real `PATCH` triage and explicitly omits assignee, matching the user's approved decision.
- No TODO/TBD placeholders remain.
