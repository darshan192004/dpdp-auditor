<script setup lang="ts">
import { computed } from 'vue';

import PageHeader from '~/components/shell/PageHeader.vue';
import AppIcon from '~/components/ui/AppIcon.vue';
import ErrorState from '~/components/ui/ErrorState.vue';
import EmptyState from '~/components/ui/EmptyState.vue';
import GlassCard from '~/components/glass/GlassCard.vue';
import UsageMeter from '~/components/glass/UsageMeter.vue';
import { useAppContext } from '~/composables/useAppContext';
import { FINDING_SCANNERS, type FindingScanner } from '~~/shared/findings';
import type { OrgSummary } from '~~/shared/org';
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
  { label: 'Scored controls', value: scored.value },
  { label: 'Not yet scored', value: (catalog.value?.total ?? 0) - scored.value },
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

/** P5-01: org usage vs quota for the usage meter. */
const requestFetch = useRequestFetch();
const summaryResult = await useAsyncData<OrgSummary>('overview-org-summary', async () => {
  const result = await requestFetch<{ data: OrgSummary }>('/api/v1/org/summary');
  return result.data;
});
const orgSummary = computed(() => summaryResult.data.value ?? null);

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
  <div class="space-y-5">
    <PageHeader title="Overview" :breadcrumbs="[{ label: 'Overview' }]">
      <template #actions>
        <NuxtLink
          to="/app/repos"
          class="focus-visible:ring-brand-500 text-ink-900 inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-white/10 bg-white/10 px-3 py-1.5 text-sm font-medium backdrop-blur-sm hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
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
      <!-- Top row: catalog summary (wide) + usage meter (narrow) -->
      <div class="grid gap-5 lg:grid-cols-4">
        <section
          aria-labelledby="catalog-heading"
          class="bg-surface rounded-[var(--radius-card)] border border-white/10 p-6 shadow-[var(--shadow-card)] lg:col-span-3"
        >
          <div class="mb-6 flex flex-wrap items-start justify-between gap-3">
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
              class="text-brand-600 hover:text-brand-500 focus-visible:ring-brand-500 hover:border-brand-100 rounded-[var(--radius-control)] border border-transparent px-3 py-1.5 text-xs font-medium underline-offset-4 transition-all hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Browse catalog
            </NuxtLink>
          </div>

          <div v-if="loading" class="bg-ink-100 mt-6 h-2 w-full animate-pulse rounded-full" />
          <template v-else>
            <div
              class="mt-6 flex h-2 w-full gap-px overflow-hidden rounded-full bg-white/10"
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

          <dl class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div v-for="kpi in KPIS" :key="kpi.label">
              <dt class="text-ink-500 text-xs tracking-wider uppercase">{{ kpi.label }}</dt>
              <dd class="text-ink-900 mt-1 font-mono text-xl font-semibold tabular-nums">
                {{ loading ? '—' : kpi.value }}
              </dd>
            </div>
          </dl>
        </section>

        <!-- Usage meter: plan + monthly quota -->
        <UsageMeter v-if="org" :summary="orgSummary" />
        <EmptyState
          v-else
          title="No organisation selected"
          description="Select an organisation to view plan usage and quotas."
          icon="shield-alert"
        />
      </div>

      <!-- Middle row: sections table (wide) + signal sources + recent scans (narrow) -->
      <div class="grid gap-5 lg:grid-cols-4">
        <section
          aria-labelledby="sections-heading"
          class="bg-surface overflow-hidden rounded-[var(--radius-card)] border border-white/10 shadow-[var(--shadow-card)] lg:col-span-3"
        >
          <div
            class="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 px-5 pt-5 pb-3"
          >
            <div>
              <h2 id="sections-heading" class="text-ink-900 text-sm font-semibold">
                Controls by section
              </h2>
              <p class="text-ink-500 mt-0.5 text-xs">DPDPA sections the catalog covers</p>
            </div>
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
                    class="text-ink-400 px-5 py-3 font-mono text-xs font-medium tracking-widest uppercase"
                  >
                    Section
                  </th>
                  <th
                    scope="col"
                    class="text-ink-400 px-5 py-3 text-right font-mono text-xs font-medium tracking-widest uppercase"
                  >
                    Controls
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="option in sections"
                  :key="option.section"
                  class="border-b border-white/5 transition-colors hover:bg-white/5"
                >
                  <td class="px-5 py-3">
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
                  <td class="text-ink-900 px-5 py-3 text-right font-mono tabular-nums">
                    {{ option.count }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <div class="space-y-5 lg:col-span-1">
          <section
            aria-labelledby="scanners-heading"
            class="bg-surface rounded-[var(--radius-card)] border border-white/10 p-5 shadow-[var(--shadow-card)]"
          >
            <h2 id="scanners-heading" class="text-ink-900 text-sm font-semibold">Signal sources</h2>
            <p class="text-ink-500 mt-1 text-xs">Scanner mappings behind the catalog</p>
            <ul class="mt-4 space-y-3">
              <li v-for="scanner in FINDING_SCANNERS" :key="scanner">
                <div class="mb-1 flex items-baseline justify-between gap-2">
                  <span class="text-ink-600 text-xs">{{ SCANNER_LABELS[scanner] }}</span>
                  <span class="text-ink-900 font-mono text-xs tabular-nums">{{
                    scannerCounts[scanner]
                  }}</span>
                </div>
                <div class="h-1 w-full overflow-hidden rounded-full bg-white/10">
                  <span
                    class="bg-brand-600 block h-full"
                    :style="{ width: scannerWidth(scannerCounts[scanner]) }"
                  />
                </div>
              </li>
            </ul>
          </section>

          <section
            aria-labelledby="recent-heading"
            class="bg-surface rounded-[var(--radius-card)] border border-white/10 p-5 shadow-[var(--shadow-card)]"
          >
            <h2 id="recent-heading" class="text-ink-900 text-sm font-semibold">Recent scans</h2>
            <p class="text-ink-500 mt-2 text-xs">
              No scans yet. Completed scans and their scores appear here after the first run.
            </p>
            <NuxtLink
              to="/app/scans"
              class="text-ink-700 focus-visible:ring-brand-500 mt-3 inline-flex items-center gap-1 rounded-[var(--radius-control)] border border-transparent px-2 py-1 text-xs font-medium hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              View scans
              <AppIcon name="chevron-right" :size="12" />
            </NuxtLink>
          </section>
        </div>
      </div>

      <!-- Quick links -->
      <ul class="grid gap-4 sm:grid-cols-3">
        <li v-for="link in QUICK_LINKS" :key="link.to">
          <GlassCard elevation="surface" padding="md">
            <NuxtLink
              :to="link.to"
              class="focus-visible:ring-brand-500 block rounded-[var(--radius-card)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <div class="flex items-center gap-2">
                <span class="text-ink-900 flex items-center gap-1 text-sm font-medium">
                  {{ link.label }}
                  <AppIcon name="chevron-right" :size="12" class="text-ink-400" />
                </span>
              </div>
              <p class="text-ink-500 mt-2 text-xs">{{ link.description }}</p>
            </NuxtLink>
          </GlassCard>
        </li>
      </ul>
    </template>
  </div>
</template>
