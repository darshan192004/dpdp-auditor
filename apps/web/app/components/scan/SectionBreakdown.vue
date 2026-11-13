<script setup lang="ts">
import { computed } from 'vue';

import {
  formatScore,
  SECTION_STATUS_LABELS,
  type ScanSectionRow,
  type SectionStatus,
} from '~~/shared/scan';

const props = defineProps<{
  scanId: string;
  rows: ScanSectionRow[];
}>();

const STATUS_CLASSES: Record<SectionStatus, string> = {
  compliant: 'bg-status-compliant-bg text-status-compliant-text border-status-compliant-border',
  partial: 'bg-status-partial-bg text-status-partial-text border-status-partial-border',
  non_compliant:
    'bg-status-noncompliant-bg text-status-noncompliant-text border-status-noncompliant-border',
  not_assessed: 'bg-status-na-bg text-status-na-text border-status-na-border',
};

const BAR_CLASSES: Record<SectionStatus, string> = {
  compliant: 'bg-status-compliant-text',
  partial: 'bg-status-partial-text',
  non_compliant: 'bg-status-noncompliant-text',
  not_assessed: 'bg-transparent',
};

const rowsWithLink = computed(() =>
  props.rows.map((row) => ({
    ...row,
    to: { path: `/app/scans/${props.scanId}/findings`, query: { section: row.section } },
  })),
);
</script>

<template>
  <section
    aria-labelledby="sections-heading"
    class="border-ink-200 bg-surface overflow-hidden rounded-[var(--radius-card)] border"
  >
    <div
      class="border-ink-200 flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3"
    >
      <h2 id="sections-heading" class="text-ink-900 text-sm font-semibold">Sections</h2>
      <p class="text-ink-500 text-xs">Worst first. Select a section to filter its findings.</p>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full border-collapse text-left text-sm">
        <caption class="sr-only">
          DPDPA section scores, sorted from lowest to highest. Selecting a section opens its
          findings.
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
              Score
            </th>
            <th
              scope="col"
              class="text-ink-400 px-4 py-2 font-mono text-xs font-medium tracking-widest uppercase"
            >
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rowsWithLink"
            :key="row.section"
            class="border-ink-200 hover:bg-ink-100/50 border-t transition-colors"
            :class="row.status === 'not_assessed' ? 'text-ink-500' : 'text-ink-800'"
          >
            <td class="px-4 py-2.5">
              <NuxtLink
                :to="row.to"
                class="focus-visible:ring-brand-500 inline-flex items-baseline gap-2 rounded-[var(--radius-control)] underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <span class="text-ink-400 font-mono text-xs tabular-nums">{{ row.section }}</span>
                <span>{{ row.label }}</span>
              </NuxtLink>
            </td>
            <td class="px-4 py-2.5 text-right font-mono font-medium tabular-nums">
              {{ formatScore(row.score) }}
            </td>
            <td class="px-4 py-2.5">
              <div class="flex items-center gap-2">
                <span
                  class="bg-ink-200 h-1.5 w-20 overflow-hidden rounded-[var(--radius-pill)]"
                  aria-hidden="true"
                >
                  <span
                    class="block h-full"
                    :class="BAR_CLASSES[row.status]"
                    :style="{ width: `${row.score ?? 0}%` }"
                  />
                </span>
                <span
                  class="inline-flex items-center rounded-[var(--radius-pill)] border px-2 py-0.5 text-xs font-medium whitespace-nowrap"
                  :class="STATUS_CLASSES[row.status]"
                >
                  {{ SECTION_STATUS_LABELS[row.status] }}
                </span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
