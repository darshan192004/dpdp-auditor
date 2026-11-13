<script setup lang="ts">
import { computed } from 'vue';

import type { FindingSort, FindingView, FindingsPagination } from '~~/shared/findings';
import ConfidenceBadge from './ConfidenceBadge.vue';
import ScannerLabel from './ScannerLabel.vue';
import SeverityBadge from './SeverityBadge.vue';
import StatusBadge from './StatusBadge.vue';
import AppIcon from '../ui/AppIcon.vue';
import EmptyState from '../ui/EmptyState.vue';

const props = withDefaults(
  defineProps<{
    findings: FindingView[];
    pagination: FindingsPagination;
    sort: FindingSort;
    caption?: string;
    loading?: boolean;
    selectedId?: string | null;
  }>(),
  {
    caption: 'Findings for this scan',
    loading: false,
    selectedId: null,
  },
);

const emit = defineEmits<{
  select: [finding: FindingView];
  'update:sort': [sort: FindingSort];
  'update:page': [page: number];
  'update:pageSize': [pageSize: number];
  clear: [];
}>();

const severitySorted = computed(() => props.sort === '-severity');
const fileSorted = computed(() => props.sort === 'file' || props.sort === '-lineStart');
const fileDirection = computed(() => (props.sort === 'file' ? 'ascending' : 'descending'));

const start = computed(() =>
  props.pagination.totalItems === 0 || props.findings.length === 0
    ? 0
    : (props.pagination.page - 1) * props.pagination.pageSize + 1,
);
// Derive the end from the rows actually rendered so a short final page reports
// its real window instead of the page-size ceiling.
const end = computed(() =>
  props.findings.length === 0 ? 0 : start.value + props.findings.length - 1,
);
const hasPrevious = computed(() => props.pagination.page > 1);
const hasNext = computed(() => props.pagination.page < props.pagination.totalPages);

function toggleFileSort(): void {
  emit('update:sort', props.sort === 'file' ? '-lineStart' : 'file');
}

function changePageSize(event: Event): void {
  const value = Number((event.target as HTMLSelectElement).value);
  emit('update:pageSize', value);
}

function lineRange(finding: FindingView): string {
  return finding.lineStart === finding.lineEnd
    ? `${finding.lineStart}`
    : `${finding.lineStart}–${finding.lineEnd}`;
}
</script>

<template>
  <div class="border-ink-200 bg-surface overflow-hidden rounded-[var(--radius-card)] border">
    <div v-if="!loading && findings.length === 0" class="p-4">
      <EmptyState
        title="No findings match these filters"
        description="Remove a filter, or search for a rule ID or message."
        action-label="Clear filters"
        icon="filter"
        @action="emit('clear')"
      />
    </div>

    <div v-else class="relative overflow-x-auto">
      <table
        class="w-full border-collapse text-left text-sm"
        :aria-busy="loading ? 'true' : undefined"
      >
        <caption class="sr-only">
          {{
            caption
          }}
        </caption>
        <thead class="bg-ink-100/60">
          <tr>
            <th
              scope="col"
              class="text-ink-600 bg-ink-100 sticky top-0 left-0 z-20 w-28 px-3 py-2 text-xs font-medium"
              :aria-sort="severitySorted ? 'descending' : 'none'"
            >
              <button
                type="button"
                class="focus-visible:ring-brand-500 inline-flex items-center gap-1 rounded-[var(--radius-control)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                @click="emit('update:sort', '-severity')"
              >
                Severity
                <AppIcon
                  :name="severitySorted ? 'chevron-right' : 'minus'"
                  :size="12"
                  class="text-ink-400"
                />
              </button>
            </th>
            <th scope="col" class="text-ink-600 w-48 px-3 py-2 text-xs font-medium">Control</th>
            <th
              scope="col"
              class="text-ink-600 min-w-64 px-3 py-2 text-xs font-medium"
              :aria-sort="fileSorted ? fileDirection : 'none'"
            >
              <button
                type="button"
                class="focus-visible:ring-brand-500 inline-flex items-center gap-1 rounded-[var(--radius-control)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                @click="toggleFileSort"
              >
                Finding
                <AppIcon
                  :name="fileSorted ? 'chevron-right' : 'minus'"
                  :size="12"
                  class="text-ink-400"
                />
              </button>
            </th>
            <th scope="col" class="text-ink-600 w-28 px-3 py-2 text-xs font-medium">Scanner</th>
            <th scope="col" class="text-ink-600 w-28 px-3 py-2 text-xs font-medium">Confidence</th>
            <th scope="col" class="text-ink-600 w-32 px-3 py-2 text-xs font-medium">Status</th>
            <th scope="col" class="text-ink-600 w-20 px-3 py-2 text-xs font-medium">
              <span class="sr-only">Actions</span>
            </th>
          </tr>
        </thead>

        <tbody v-if="loading">
          <tr v-for="row in 6" :key="row">
            <td colspan="7" class="border-ink-100 border-t px-3 py-3">
              <div class="bg-ink-100 h-4 animate-pulse rounded-[var(--radius-control)]" />
            </td>
          </tr>
        </tbody>

        <tbody v-else>
          <tr
            v-for="finding in findings"
            :id="`finding-row-${finding.id}`"
            :key="finding.id"
            tabindex="0"
            :aria-current="selectedId === finding.id ? 'true' : undefined"
            class="border-ink-100 hover:bg-ink-100/60 focus-visible:ring-brand-500 group cursor-pointer border-t align-top focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
            @click="emit('select', finding)"
            @keydown.enter.prevent="emit('select', finding)"
          >
            <td class="bg-surface group-hover:bg-ink-100 sticky left-0 z-10 px-3 py-3">
              <SeverityBadge :severity="finding.severity" />
            </td>
            <td class="px-3 py-3">
              <span class="text-ink-900 block font-mono text-xs">
                {{ finding.dpdpa?.code ?? 'Unmapped' }}
              </span>
              <span v-if="finding.dpdpa" class="text-ink-500 mt-0.5 block text-xs">
                {{ finding.dpdpa.title }}
              </span>
            </td>
            <td class="px-3 py-3">
              <span class="text-ink-900 line-clamp-2 block">{{ finding.message }}</span>
              <span class="text-ink-500 mt-1 block font-mono text-xs">
                {{ finding.filePath }}:{{ lineRange(finding) }}
              </span>
            </td>
            <td class="px-3 py-3">
              <ScannerLabel :scanner="finding.scanner" />
            </td>
            <td class="px-3 py-3">
              <ConfidenceBadge :confidence="finding.confidence" />
            </td>
            <td class="px-3 py-3">
              <StatusBadge :status="finding.status" />
            </td>
            <td class="px-3 py-3">
              <button
                type="button"
                class="text-ink-600 hover:bg-ink-100 hover:text-ink-900 focus-visible:ring-brand-500 inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                :aria-label="`Open finding: ${finding.message}`"
                @click.stop="emit('select', finding)"
              >
                <AppIcon name="chevron-right" :size="16" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-if="!loading && pagination.totalItems > 0 && findings.length > 0"
      class="border-ink-200 text-ink-600 flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2 text-xs"
    >
      <p class="tabular-nums">{{ start }}–{{ end }} of {{ pagination.totalItems }}</p>

      <div class="flex items-center gap-3">
        <label class="flex items-center gap-1.5">
          <span>Rows</span>
          <select
            :value="pagination.pageSize"
            class="border-ink-200 text-ink-700 focus-visible:ring-brand-500 bg-surface rounded-[var(--radius-control)] border px-1.5 py-1 focus-visible:ring-2 focus-visible:outline-none"
            @change="changePageSize"
          >
            <option :value="25">25</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select>
        </label>

        <div class="flex items-center gap-1">
          <button
            type="button"
            class="border-ink-200 focus-visible:ring-brand-500 bg-surface inline-flex items-center gap-1 rounded-[var(--radius-control)] border px-2 py-1 font-medium focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!hasPrevious"
            @click="emit('update:page', pagination.page - 1)"
          >
            <AppIcon name="chevron-left" :size="12" />
            Previous
          </button>
          <button
            type="button"
            class="border-ink-200 focus-visible:ring-brand-500 bg-surface inline-flex items-center gap-1 rounded-[var(--radius-control)] border px-2 py-1 font-medium focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!hasNext"
            @click="emit('update:page', pagination.page + 1)"
          >
            Next
            <AppIcon name="chevron-right" :size="12" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
