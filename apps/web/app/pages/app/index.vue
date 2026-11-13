<script setup lang="ts">
import { computed } from 'vue';

import PageHeader from '~/components/shell/PageHeader.vue';
import AppIcon from '~/components/ui/AppIcon.vue';
import ErrorState from '~/components/ui/ErrorState.vue';
import { useAppContext } from '~/composables/useAppContext';
import { FINDING_SCANNERS } from '~~/shared/findings';
import { ruleScannerCounts, ruleSections, SCANNER_LABELS, type RulesPage } from '~~/shared/rules';

definePageMeta({ layout: 'app' });

const { org } = useAppContext();

const { data, status, error, refresh } = await useFetch<RulesPage>('/api/v1/rules');

const controls = computed(() => data.value?.data ?? []);
const sections = computed(() => ruleSections(controls.value));
const scannerCounts = computed(() => ruleScannerCounts(controls.value));
const scored = computed(() => controls.value.filter((rule) => rule.scored).length);
const mappings = computed(() =>
  controls.value.reduce((sum, rule) => sum + rule.mappings.length, 0),
);
const loading = computed(() => status.value === 'pending');

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
  <div class="space-y-6">
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
          aria-labelledby="posture-heading"
          class="border-ink-200 bg-surface rounded-[var(--radius-card)] border p-5 lg:col-span-2"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2
                id="posture-heading"
                class="text-ink-400 font-mono text-xs tracking-widest uppercase"
              >
                Compliance posture
              </h2>
              <p class="text-ink-900 mt-2 text-2xl font-semibold tracking-tight">No score yet</p>
            </div>
            <span
              class="border-status-na-border bg-status-na-bg text-status-na-text inline-flex items-center gap-1 rounded-[var(--radius-pill)] border px-2.5 py-0.5 text-xs font-medium"
            >
              <span class="bg-status-na-text h-1.5 w-1.5 rounded-full" aria-hidden="true" />
              Not scanned
            </span>
          </div>

          <p class="text-ink-600 mt-3 max-w-prose text-sm">
            {{ org?.name ?? 'Your organisation' }} has no completed scan yet. A score appears here
            once a repository is connected and its default branch is scanned.
          </p>

          <div
            class="border-ink-200 bg-ink-100/50 mt-5 rounded-[var(--radius-control)] border border-dashed px-4 py-6"
          >
            <div class="flex flex-wrap items-center gap-4">
              <div
                class="border-ink-300 text-ink-400 flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-dashed font-mono text-lg"
                aria-hidden="true"
              >
                —
              </div>
              <div class="min-w-0">
                <p class="text-ink-800 text-sm font-medium">Connect a repository to begin</p>
                <p class="text-ink-500 mt-0.5 text-xs">
                  Scans run on the default branch and record the evidence behind every finding.
                </p>
              </div>
              <NuxtLink
                to="/app/repos"
                class="border-ink-200 text-ink-700 hover:bg-ink-100 focus-visible:ring-brand-500 bg-surface ml-auto inline-flex items-center gap-1 rounded-[var(--radius-control)] border px-3 py-1.5 text-xs font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                Open repositories
                <AppIcon name="chevron-right" :size="12" />
              </NuxtLink>
            </div>
          </div>

          <dl
            class="border-ink-200 bg-ink-200 mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-control)] border sm:grid-cols-4"
          >
            <div class="bg-surface px-3 py-2.5">
              <dt class="text-ink-500 text-xs">Critical findings</dt>
              <dd class="text-ink-400 mt-0.5 font-mono text-lg tabular-nums">—</dd>
            </div>
            <div class="bg-surface px-3 py-2.5">
              <dt class="text-ink-500 text-xs">Open findings</dt>
              <dd class="text-ink-400 mt-0.5 font-mono text-lg tabular-nums">—</dd>
            </div>
            <div class="bg-surface px-3 py-2.5">
              <dt class="text-ink-500 text-xs">Sections assessed</dt>
              <dd class="text-ink-400 mt-0.5 font-mono text-lg tabular-nums">—</dd>
            </div>
            <div class="bg-surface px-3 py-2.5">
              <dt class="text-ink-500 text-xs">Last scan</dt>
              <dd class="text-ink-400 mt-0.5 font-mono text-lg tabular-nums">—</dd>
            </div>
          </dl>
        </section>

        <section
          aria-labelledby="catalog-heading"
          class="border-ink-200 bg-surface rounded-[var(--radius-card)] border p-5"
        >
          <div class="flex items-baseline justify-between gap-2">
            <h2 id="catalog-heading" class="text-ink-900 text-sm font-semibold">Control catalog</h2>
            <NuxtLink
              to="/app/rules"
              class="text-brand-700 hover:text-brand-600 focus-visible:ring-brand-500 rounded-[var(--radius-control)] text-xs font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Browse
            </NuxtLink>
          </div>

          <p v-if="loading" class="text-ink-500 mt-4 text-sm">Loading the catalog…</p>

          <template v-else>
            <p class="text-ink-900 mt-3 flex items-baseline gap-1.5">
              <span class="font-mono text-4xl font-semibold tabular-nums">{{
                controls.length
              }}</span>
              <span class="text-ink-500 text-sm">controls</span>
            </p>

            <dl class="border-ink-200 divide-ink-200 mt-4 divide-y border-t text-sm">
              <div class="flex items-center justify-between py-2">
                <dt class="text-ink-500">Scored by code</dt>
                <dd class="text-ink-800 font-mono tabular-nums">{{ scored }}</dd>
              </div>
              <div class="flex items-center justify-between py-2">
                <dt class="text-ink-500">Listed, not scored</dt>
                <dd class="text-ink-800 font-mono tabular-nums">{{ controls.length - scored }}</dd>
              </div>
              <div class="flex items-center justify-between py-2">
                <dt class="text-ink-500">Sections</dt>
                <dd class="text-ink-800 font-mono tabular-nums">{{ sections.length }}</dd>
              </div>
              <div class="flex items-center justify-between py-2">
                <dt class="text-ink-500">Scanner mappings</dt>
                <dd class="text-ink-800 font-mono tabular-nums">{{ mappings }}</dd>
              </div>
            </dl>

            <ul class="mt-4 flex flex-wrap gap-1.5">
              <li v-for="scanner in FINDING_SCANNERS" :key="scanner">
                <span
                  class="border-ink-200 text-ink-600 inline-flex items-center gap-1 rounded-[var(--radius-pill)] border px-2 py-0.5 text-xs"
                >
                  {{ SCANNER_LABELS[scanner] }}
                  <span class="text-ink-400 font-mono tabular-nums">{{
                    scannerCounts[scanner]
                  }}</span>
                </span>
              </li>
            </ul>
          </template>
        </section>
      </div>

      <div class="grid gap-4 lg:grid-cols-3">
        <section
          aria-labelledby="sections-heading"
          class="border-ink-200 bg-surface overflow-hidden rounded-[var(--radius-card)] border lg:col-span-2"
        >
          <div
            class="border-ink-200 flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3"
          >
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
                <tr class="bg-ink-100/60">
                  <th
                    scope="col"
                    class="text-ink-400 px-4 py-2 font-mono text-xs font-medium tracking-widest uppercase"
                  >
                    Section
                  </th>
                  <th
                    scope="col"
                    class="text-ink-400 px-4 py-2 text-right font-mono text-xs font-medium tracking-widest uppercase"
                  >
                    Controls
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="option in sections"
                  :key="option.section"
                  class="border-ink-200 border-t"
                >
                  <td class="px-4 py-2">
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
                  <td class="text-ink-800 px-4 py-2 text-right font-mono tabular-nums">
                    {{ option.count }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section
          aria-labelledby="recent-heading"
          class="border-ink-200 bg-surface rounded-[var(--radius-card)] border p-5"
        >
          <h2 id="recent-heading" class="text-ink-900 text-sm font-semibold">Recent scans</h2>
          <div
            class="border-ink-200 mt-3 rounded-[var(--radius-control)] border border-dashed px-4 py-6 text-center"
          >
            <p class="text-ink-800 text-sm font-medium">No scans yet</p>
            <p class="text-ink-500 mt-1 text-xs">
              Completed scans and their scores appear here after the first run.
            </p>
            <NuxtLink
              to="/app/scans"
              class="border-ink-200 text-ink-700 hover:bg-ink-100 focus-visible:ring-brand-500 mt-3 inline-flex items-center gap-1 rounded-[var(--radius-control)] border px-3 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              View scans
            </NuxtLink>
          </div>
        </section>
      </div>

      <ul class="grid gap-4 sm:grid-cols-3">
        <li v-for="link in QUICK_LINKS" :key="link.to">
          <NuxtLink
            :to="link.to"
            class="border-ink-200 bg-surface hover:border-ink-300 hover:bg-ink-100/50 focus-visible:ring-brand-500 flex h-full flex-col gap-1 rounded-[var(--radius-card)] border p-4 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
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
