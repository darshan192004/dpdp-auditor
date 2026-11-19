<script setup lang="ts">
import { computed } from 'vue';

import StatusChip from './StatusChip.vue';
import {
  SCAN_STATUSES,
  SCAN_STATUS_LABELS,
  formatScore,
  formatTimestamp,
  type ScanListPage,
  type ScanStatus,
  type ScanSummary,
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

const options = [
  { value: '' as const, label: 'All' },
  ...SCAN_STATUSES.map((s) => ({ value: s, label: SCAN_STATUS_LABELS[s] })),
];
const pages = computed(() => Array.from({ length: props.pagination.totalPages }, (_, i) => i + 1));
// Deterministic UTC string: toLocaleDateString differs between server and
// browser locales and caused a hydration mismatch on first paint.
const when = (iso: string) => formatTimestamp(iso);
</script>

<template>
  <section aria-labelledby="scans-table-heading" class="min-w-0">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 id="scans-table-heading" class="text-ink-400 font-mono text-xs tracking-widest uppercase">
        Scan history
      </h2>
      <button
        type="button"
        data-action="new-scan"
        class="bg-brand-500 text-ink-50 rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium"
        @click="emit('newScan')"
      >
        + New scan
      </button>
    </div>

    <div class="flex flex-wrap gap-2" role="group" aria-label="Filter scans by status">
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        :data-status-filter="option.value || 'all'"
        :aria-pressed="status === option.value"
        :disabled="loading"
        :class="status === option.value ? 'bg-brand-500 text-ink-50' : 'bg-ink-100 text-ink-600'"
        class="rounded-[var(--radius-pill)] px-2.5 py-1 font-mono text-[11px] disabled:opacity-40"
        @click="emit('update:status', option.value)"
      >
        {{ option.label }}
      </button>
    </div>

    <div v-if="loading" role="status" class="text-ink-400 mt-4 text-sm">Loading scans.</div>
    <p v-else-if="scans.length === 0" class="text-ink-400 mt-6 text-sm">No scans yet.</p>
    <div v-else class="border-ink-200 mt-4 overflow-x-auto rounded-[var(--radius-card)] border">
      <table class="w-full min-w-[640px] text-left text-sm">
        <thead class="bg-ink-100 text-ink-400 font-mono text-[11px] tracking-wider uppercase">
          <tr>
            <th class="px-3 py-2">Repository</th>
            <th class="px-3 py-2">Status</th>
            <th class="px-3 py-2">Score</th>
            <th class="px-3 py-2">When</th>
          </tr>
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
      <button
        v-for="page in pages"
        :key="page"
        type="button"
        :data-page="page"
        :aria-current="page === pagination.page ? 'page' : undefined"
        :class="page === pagination.page ? 'text-ink-50 bg-brand-500' : 'bg-ink-100 text-ink-600'"
        class="rounded-[var(--radius-control)] px-2 py-1 font-mono text-xs"
        @click="emit('update:page', page)"
      >
        {{ page }}
      </button>
    </nav>
  </section>
</template>
