<script setup lang="ts">
import { computed } from 'vue';

import PageHeader from '~/components/shell/PageHeader.vue';
import AppIcon from '~/components/ui/AppIcon.vue';
import ErrorState from '~/components/ui/ErrorState.vue';
import { useAppContext } from '~/composables/useAppContext';
import { FINDING_SCANNERS, type FindingScanner } from '~~/shared/findings';
import {
  ruleScannerCounts,
  ruleSections,
  SCANNER_LABELS,
  type RuleSectionOption,
  type RulesPage,
} from '~~/shared/rules';

definePageMeta({ layout: 'app' });

const { org } = useAppContext();

interface CatalogSummary {
  total: number;
  scored: number;
  sections: RuleSectionOption[];
  scannerCounts: Record<FindingScanner, number>;
  mappings: number;
}

/**
 * The overview only needs counts. Summarise the catalog on the server so the
 * hydration payload carries a few hundred bytes instead of the whole catalog
 * (which is tens of kilobytes and only the rule explorer needs it).
 */
const { data, status, error, refresh } = await useAsyncData<CatalogSummary>(
  'overview-catalog',
  async () => {
    const page = await $fetch<RulesPage>('/api/v1/rules');
    const controls = page.data;
    return {
      total: controls.length,
      scored: controls.filter((rule) => rule.scored).length,
      sections: ruleSections(controls),
      scannerCounts: ruleScannerCounts(controls),
      mappings: controls.reduce((sum, rule) => sum + rule.mappings.length, 0),
    };
  },
);

const catalog = computed<CatalogSummary | null>(() => data.value ?? null);
const sections = computed(() => catalog.value?.sections ?? []);
const scannerCounts = computed(
  () => catalog.value?.scannerCounts ?? ({} as Record<FindingScanner, number>),
);
const scored = computed(() => catalog.value?.scored ?? 0);
const mappings = computed(() => catalog.value?.mappings ?? 0);
const loading = computed(() => status.value === 'pending');

// Green ramp for the coverage band — one hue, three steps, so the bar reads as a
// single signal rather than a rainbow.
const BAR_TONES = ['bg-brand-500', 'bg-brand-700', 'bg-brand-100'] as const;

const sectionTotal = computed(() => Math.max(1, catalog.value?.total ?? 0));
const sectionWidth = (count: number) => `${(count / sectionTotal.value) * 100}%`;
const toneFor = (index: number) => BAR_TONES[index % BAR_TONES.length];

const coverageLabel = computed(() =>
  sections.value.map((option) => `section ${option.section}: ${option.count}`).join(', '),
);

const maxScannerCount = computed(() =>
  Math.max(1, ...FINDING_SCANNERS.map((scanner) => scannerCounts.value[scanner])),
);
const scannerWidth = (count: number) => `${(count / maxScannerCount.value) * 100}%`;

const KPIS = computed(() => [
  { label: 'Scored by code', value: scored.value },
  { label: 'Listed, not scored', value: (catalog.value?.total ?? 0) - scored.value },
  { label: 'Sections covered', value: sections.value.length },
  { label: 'Scanner mappings', value: mappings.value },
]);

const loadError = computed(() => {
  if (!error.value) return null;
  const failure = error.value as {
    statusMessage?: string;
    data?: { error?: { message?: string; requestId?: string } };
  };
  return {
    message: failure.data?.error?.message ?? 'The control catalog could not be loaded.',
    requestId: failure.data?.error?.requestId,
  };
});

const QUICK_LINKS = [
  {
    to: '/app/repos',
    label: 'Repositories',
    description: 'Connect a GitHub repository to scan its default branch.',
  },
  {
    to: '/app/rules',
    label: 'Rules',
    description: 'See what each control asks for and which scanner proves it.',
  },
  {
    to: '/app/audit',
    label: 'Audit log',
    description: 'Every score, triage decision, and export in one trail.',
  },
] as const;
</script>

<template>
  <div class="space-y-4">
    <PageHeader title="Overview" :breadcrumbs="[{ label: 'Overview' }]">
      <template #actions>
        <NuxtLink
          to="/app/repos"
          class="bg-brand-500 hover:bg-brand-600 focus-visible:ring-brand-500 text-ink-50 inline-flex items-center gap-1.5 rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <AppIcon name="plus" :size="14" />
          Connect repository
        </NuxtLink>
      </template>
    </PageHeader>

    <ErrorState
      v-if="loadError"
      :message="loadError.message"
      :request-id="loadError.requestId ?? null"
      @retry="refresh"
    />

    <template v-else>
      <div class="grid gap-4 lg:grid-cols-3">
        <section
          aria-labelledby="catalog-heading"
          class="bg-surface rounded-[var(--radius-card)] p-6 shadow-[var(--shadow-card)] lg:col-span-2"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2
                id="catalog-heading"
                class="text-ink-400 font-mono text-xs tracking-widest uppercase"
              >
                Control catalog
              </h2>
              <p class="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span class="text-ink-900 font-mono text-4xl font-semibold tabular-nums">
                  {{ loading ? '—' : (catalog?.total ?? 0) }}
                </span>
                <span class="text-ink-500 text-sm">
                  controls across {{ sections.length }} DPDPA sections
                </span>
              </p>
            </div>
            <NuxtLink
              to="/app/rules"
              class="text-brand-700 hover:text-brand-600 focus-visible:ring-brand-500 rounded-[var(--radius-control)] text-xs font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Browse catalog
            </NuxtLink>
          </div>

          <div v-if="loading" class="bg-ink-100 mt-6 h-2 w-full animate-pulse rounded-full" />
          <template v-else>
            <div
              class="bg-ink-100 mt-6 flex h-2 w-full gap-px overflow-hidden rounded-full"
              role="img"
              :aria-label="`Control coverage by section — ${coverageLabel}`"
            >
              <span
                v-for="(option, index) in sections"
                :key="option.section"
                class="h-full"
                :class="toneFor(index)"
                :style="{ width: sectionWidth(option.count) }"
                aria-hidden="true"
              />
            </div>

            <ul class="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              <li
                v-for="(option, index) in sections"
                :key="option.section"
                class="text-ink-500 flex items-center gap-1.5 text-xs"
              >
                <span class="h-1.5 w-1.5 rounded-full" :class="toneFor(index)" aria-hidden="true" />
                <span class="text-ink-400 font-mono tabular-nums">{{ option.section }}</span>
                <span class="text-ink-600 tabular-nums">{{ option.count }}</span>
              </li>
            </ul>
          </template>

          <dl class="border-ink-200 mt-6 grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-4">
            <div v-for="kpi in KPIS" :key="kpi.label">
              <dt class="text-ink-500 text-xs">{{ kpi.label }}</dt>
              <dd class="text-ink-900 mt-1 font-mono text-xl font-semibold tabular-nums">
                {{ loading ? '—' : kpi.value }}
              </dd>
            </div>
          </dl>
        </section>

        <section
          aria-labelledby="posture-heading"
          class="bg-surface flex flex-col rounded-[var(--radius-card)] p-6 shadow-[var(--shadow-card)]"
        >
          <div class="flex items-start justify-between gap-2">
            <h2
              id="posture-heading"
              class="text-ink-400 font-mono text-xs tracking-widest uppercase"
            >
              Compliance posture
            </h2>
            <span
              class="border-status-na-border bg-status-na-bg text-status-na-text inline-flex items-center gap-1 rounded-[var(--radius-pill)] border px-2 py-0.5 text-xs font-medium"
            >
              <span class="bg-status-na-text h-1.5 w-1.5 rounded-full" aria-hidden="true" />
              Not scanned
            </span>
          </div>

          <p class="text-ink-900 mt-3 text-2xl font-semibold tracking-tight">No score yet</p>
          <p class="text-ink-500 mt-2 text-sm">
            {{ org?.name ?? 'Your organisation' }} has no completed scan. A score appears once a
            repository is connected and its default branch is scanned.
          </p>

          <div
            class="bg-ink-100/50 mt-4 flex flex-1 flex-col justify-center rounded-[var(--radius-control)] px-4 py-5"
          >
            <p class="text-ink-700 text-sm font-medium">Connect a repository to begin</p>
            <p class="text-ink-500 mt-1 text-xs">
              Scans run on the default branch and record the evidence behind every finding.
            </p>
            <NuxtLink
              to="/app/repos"
              class="text-brand-700 hover:text-brand-600 focus-visible:ring-brand-500 mt-3 inline-flex items-center gap-1 rounded-[var(--radius-control)] text-xs font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Open repositories
              <AppIcon name="chevron-right" :size="12" />
            </NuxtLink>
          </div>
        </section>
      </div>

      <div class="grid gap-4 lg:grid-cols-3">
        <section
          aria-labelledby="sections-heading"
          class="bg-surface overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-card)] lg:col-span-2"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5 pb-3">
            <h2 id="sections-heading" class="text-ink-900 text-sm font-semibold">
              Controls by section
            </h2>
            <p class="text-ink-500 text-xs">DPDPA sections the catalog covers</p>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full border-collapse text-left text-sm">
              <caption class="sr-only">
                DPDPA sections with the number of controls in each.
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    class="text-ink-400 px-5 py-2 font-mono text-xs font-medium tracking-widest uppercase"
                  >
                    Section
                  </th>
                  <th
                    scope="col"
                    class="text-ink-400 px-5 py-2 text-right font-mono text-xs font-medium tracking-widest uppercase"
                  >
                    Controls
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="option in sections"
                  :key="option.section"
                  class="border-ink-200/70 hover:bg-ink-100/60 border-t transition-colors"
                >
                  <td class="px-5 py-2">
                    <NuxtLink
                      :to="{ path: '/app/rules', query: { section: option.section } }"
                      class="focus-visible:ring-brand-500 text-ink-800 inline-flex items-baseline gap-2 rounded-[var(--radius-control)] underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                    >
                      <span class="text-ink-400 font-mono text-xs tabular-nums">{{
                        option.section
                      }}</span>
                      {{ option.label }}
                    </NuxtLink>
                  </td>
                  <td class="text-ink-800 px-5 py-2 text-right font-mono tabular-nums">
                    {{ option.count }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <div class="space-y-4">
          <section
            aria-labelledby="scanners-heading"
            class="bg-surface rounded-[var(--radius-card)] p-5 shadow-[var(--shadow-card)]"
          >
            <h2 id="scanners-heading" class="text-ink-900 text-sm font-semibold">Signal sources</h2>
            <p class="text-ink-500 mt-1 text-xs">Scanner mappings behind the catalog</p>
            <ul class="mt-4 space-y-3">
              <li v-for="scanner in FINDING_SCANNERS" :key="scanner">
                <div class="flex items-baseline justify-between gap-2">
                  <span class="text-ink-600 text-xs">{{ SCANNER_LABELS[scanner] }}</span>
                  <span class="text-ink-400 font-mono text-xs tabular-nums">{{
                    scannerCounts[scanner]
                  }}</span>
                </div>
                <div class="bg-ink-100 mt-1 h-1 w-full overflow-hidden rounded-full">
                  <span
                    class="bg-brand-500 block h-full"
                    :style="{ width: scannerWidth(scannerCounts[scanner]) }"
                  />
                </div>
              </li>
            </ul>
          </section>

          <section
            aria-labelledby="recent-heading"
            class="bg-surface rounded-[var(--radius-card)] p-5 shadow-[var(--shadow-card)]"
          >
            <h2 id="recent-heading" class="text-ink-900 text-sm font-semibold">Recent scans</h2>
            <p class="text-ink-500 mt-2 text-xs">
              No scans yet. Completed scans and their scores appear here after the first run.
            </p>
            <NuxtLink
              to="/app/scans"
              class="text-ink-700 hover:bg-ink-100 focus-visible:ring-brand-500 mt-3 inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              View scans
              <AppIcon name="chevron-right" :size="12" />
            </NuxtLink>
          </section>
        </div>
      </div>

      <ul class="grid gap-4 sm:grid-cols-3">
        <li v-for="link in QUICK_LINKS" :key="link.to">
          <NuxtLink
            :to="link.to"
            class="bg-surface hover:bg-surface-raised focus-visible:ring-brand-500 flex h-full flex-col gap-1 rounded-[var(--radius-card)] p-4 shadow-[var(--shadow-card)] transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <span class="text-ink-900 flex items-center gap-1 text-sm font-medium">
              {{ link.label }}
              <AppIcon name="chevron-right" :size="12" class="text-ink-400" />
            </span>
            <span class="text-ink-500 block text-xs">{{ link.description }}</span>
          </NuxtLink>
        </li>
      </ul>
    </template>
  </div>
</template>
