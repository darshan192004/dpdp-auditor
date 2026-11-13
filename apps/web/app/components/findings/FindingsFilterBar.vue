<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import {
  FINDING_SCANNERS,
  FINDING_SEVERITIES,
  FINDING_STATUSES,
  type FindingScanner,
  type FindingSeverity,
  type FindingStatus,
  type FindingsFilters,
} from '~~/shared/findings';
import { hasActiveFilters } from '~~/shared/findings-query';
import AppIcon from '../ui/AppIcon.vue';

const props = withDefaults(defineProps<{ filters: FindingsFilters; totalItems?: number }>(), {
  totalItems: 0,
});

const emit = defineEmits<{ update: [patch: Partial<FindingsFilters>]; clear: [] }>();

const SEVERITY_LABELS: Record<FindingSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
};

const SCANNER_LABELS: Record<FindingScanner, string> = {
  semgrep: 'Semgrep',
  checkov: 'Checkov',
  gitleaks: 'Gitleaks',
};

const STATUS_LABELS: Record<FindingStatus, string> = {
  open: 'Open',
  false_positive: 'False positive',
  accepted_risk: 'Accepted risk',
  fixed: 'Fixed',
  reopened: 'Reopened',
};

const active = computed(() => hasActiveFilters(props.filters));
const countLabel = computed(
  () => `${props.totalItems} ${props.totalItems === 1 ? 'finding' : 'findings'}`,
);

const search = ref(props.filters.q);
let debounce: ReturnType<typeof setTimeout> | undefined;

// Keep the box in step when the URL changes underneath us (Clear filters, back).
watch(
  () => props.filters.q,
  (value) => {
    if (value !== search.value) search.value = value;
  },
);

function scheduleSearch(): void {
  if (debounce !== undefined) clearTimeout(debounce);
  debounce = setTimeout(() => emit('update', { q: search.value.trim() }), 300);
}

function applySearch(): void {
  if (debounce !== undefined) clearTimeout(debounce);
  emit('update', { q: search.value.trim() });
}

onBeforeUnmount(() => {
  if (debounce !== undefined) clearTimeout(debounce);
});

const section = ref(props.filters.section[0] ?? '');

watch(
  () => props.filters.section,
  (value) => {
    const next = value[0] ?? '';
    if (next !== section.value) section.value = next;
  },
);

function applySection(): void {
  const value = section.value.trim();
  if (value === (props.filters.section[0] ?? '')) return;
  emit('update', { section: value === '' ? [] : [value] });
}

function toggle<T>(current: T[], value: T): T[] {
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div class="relative min-w-56 flex-1 sm:max-w-sm">
        <AppIcon
          name="search"
          :size="14"
          class="text-ink-400 pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
        />
        <input
          v-model="search"
          type="search"
          aria-label="Search findings"
          placeholder="Search message or rule ID"
          class="border-ink-200 text-ink-900 placeholder:text-ink-400 focus-visible:ring-brand-500 w-full rounded-[var(--radius-control)] border bg-white py-1.5 pr-2 pl-8 text-sm focus-visible:ring-2 focus-visible:outline-none"
          @input="scheduleSearch"
          @keydown.enter.prevent="applySearch"
        />
      </div>

      <label class="text-ink-600 flex items-center gap-2 text-xs">
        Section
        <input
          v-model="section"
          name="section"
          type="text"
          inputmode="text"
          placeholder="8(4)"
          class="border-ink-200 text-ink-900 placeholder:text-ink-400 focus-visible:ring-brand-500 w-20 rounded-[var(--radius-control)] border bg-white px-2 py-1 font-mono text-xs focus-visible:ring-2 focus-visible:outline-none"
          @keydown.enter.prevent="applySection"
          @blur="applySection"
        />
      </label>

      <p class="text-ink-500 ml-auto text-xs tabular-nums" role="status" aria-live="polite">
        {{ countLabel }}
      </p>

      <button
        v-if="active"
        type="button"
        class="border-ink-200 text-ink-700 hover:bg-ink-50 focus-visible:ring-brand-500 inline-flex items-center gap-1 rounded-[var(--radius-control)] border bg-white px-2 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none"
        @click="emit('clear')"
      >
        <AppIcon name="x" :size="12" />
        Clear filters
      </button>
    </div>

    <div class="flex flex-wrap items-start gap-x-6 gap-y-2">
      <fieldset class="flex flex-wrap items-center gap-1.5">
        <legend class="text-ink-500 float-left mr-1 text-xs">Severity</legend>
        <button
          v-for="severity in FINDING_SEVERITIES"
          :key="severity"
          type="button"
          :aria-pressed="filters.severity.includes(severity)"
          class="focus-visible:ring-brand-500 rounded-[var(--radius-pill)] border px-2 py-0.5 text-xs font-medium focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
          :class="
            filters.severity.includes(severity)
              ? 'border-brand-700 bg-brand-700 text-white'
              : 'border-ink-200 text-ink-600 hover:bg-ink-50 bg-white'
          "
          @click="emit('update', { severity: toggle(filters.severity, severity) })"
        >
          {{ SEVERITY_LABELS[severity] }}
        </button>
      </fieldset>

      <fieldset class="flex flex-wrap items-center gap-1.5">
        <legend class="text-ink-500 float-left mr-1 text-xs">Scanner</legend>
        <button
          v-for="scanner in FINDING_SCANNERS"
          :key="scanner"
          type="button"
          :aria-pressed="filters.scanner.includes(scanner)"
          class="focus-visible:ring-brand-500 rounded-[var(--radius-pill)] border px-2 py-0.5 text-xs font-medium focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
          :class="
            filters.scanner.includes(scanner)
              ? 'border-brand-700 bg-brand-700 text-white'
              : 'border-ink-200 text-ink-600 hover:bg-ink-50 bg-white'
          "
          @click="emit('update', { scanner: toggle(filters.scanner, scanner) })"
        >
          {{ SCANNER_LABELS[scanner] }}
        </button>
      </fieldset>

      <fieldset class="flex flex-wrap items-center gap-1.5">
        <legend class="text-ink-500 float-left mr-1 text-xs">Status</legend>
        <button
          v-for="status in FINDING_STATUSES"
          :key="status"
          type="button"
          :aria-pressed="filters.status.includes(status)"
          class="focus-visible:ring-brand-500 rounded-[var(--radius-pill)] border px-2 py-0.5 text-xs font-medium focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
          :class="
            filters.status.includes(status)
              ? 'border-brand-700 bg-brand-700 text-white'
              : 'border-ink-200 text-ink-600 hover:bg-ink-50 bg-white'
          "
          @click="emit('update', { status: toggle(filters.status, status) })"
        >
          {{ STATUS_LABELS[status] }}
        </button>
      </fieldset>
    </div>
  </div>
</template>
