<script setup lang="ts">
import { computed } from 'vue';

import {
  formatScore,
  trendFor,
  type ScanCounts,
  type ScanGrade,
  type CoverageState,
} from '~~/shared/scan';
import AppIcon from '../ui/AppIcon.vue';
import CoverageBanner from './CoverageBanner.vue';

const props = withDefaults(
  defineProps<{
    scanId: string;
    score: number | null;
    grade?: ScanGrade | null;
    previousScore?: number | null;
    coverage: CoverageState;
    coverageNote?: string | null;
    counts: ScanCounts;
    isLoading?: boolean;
  }>(),
  { grade: null, previousScore: null, coverageNote: null, isLoading: false },
);

const COUNT_ITEMS = [
  { key: 'critical', label: 'Critical', dot: 'bg-risk-critical-solid' },
  { key: 'high', label: 'High', dot: 'bg-risk-high-solid' },
  { key: 'medium', label: 'Medium', dot: 'bg-risk-medium-solid' },
  { key: 'low', label: 'Low', dot: 'bg-risk-low-solid' },
  { key: 'info', label: 'Info', dot: 'bg-risk-info-solid' },
] as const;

const gaugeWidth = computed(() =>
  props.score === null ? 0 : Math.min(100, Math.max(0, props.score)),
);
const trend = computed(() => trendFor(props.score, props.previousScore));
const trendGlyph = computed(() => {
  if (trend.value === null) return '';
  if (trend.value.direction === 'up') return '↑';
  if (trend.value.direction === 'down') return '↓';
  return '→';
});
const trendClass = computed(() => {
  if (trend.value?.direction === 'up') return 'text-status-compliant-text';
  if (trend.value?.direction === 'down') return 'text-risk-critical-text';
  return 'text-ink-500';
});
const trendLabel = computed(() => {
  if (trend.value === null) return '';
  const points = Math.abs(trend.value.delta).toFixed(1);
  const direction =
    trend.value.direction === 'up' ? 'up' : trend.value.direction === 'down' ? 'down' : 'unchanged';
  return `${direction} ${points} points versus the previous scan`;
});
const gaugeLabel = computed(() => {
  if (props.score === null) return 'DPDPA score not available';
  const grade = props.grade === null ? 'grade withheld' : `grade ${props.grade}`;
  return `DPDPA score ${formatScore(props.score)} out of 100, ${grade}`;
});
</script>

<template>
  <section
    aria-labelledby="score-heading"
    class="bg-surface rounded-[var(--radius-card)] p-5 shadow-[var(--shadow-card)]"
  >
    <div v-if="isLoading" aria-busy="true" class="space-y-3">
      <div class="bg-ink-200 h-3 w-24 rounded-[var(--radius-control)]" />
      <div class="bg-ink-200 h-9 w-40 rounded-[var(--radius-control)]" />
      <div class="bg-ink-200 h-2 w-full rounded-[var(--radius-pill)]" />
      <div class="bg-ink-200 h-4 w-2/3 rounded-[var(--radius-control)]" />
      <p class="sr-only" role="status">Loading scan score</p>
    </div>

    <template v-else>
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <h2 id="score-heading" class="text-ink-400 font-mono text-xs tracking-widest uppercase">
            DPDPA score
          </h2>
          <p v-if="score !== null" class="mt-1 flex items-baseline gap-1">
            <span class="text-ink-900 text-4xl font-semibold tabular-nums">{{
              formatScore(score)
            }}</span>
            <span class="text-ink-500 text-sm">/ 100</span>
          </p>
          <p v-else class="text-ink-900 mt-1 text-2xl font-semibold">Not scored</p>
        </div>

        <div class="flex flex-col items-start gap-1.5 sm:items-end">
          <span
            v-if="grade !== null"
            class="border-brand-700/60 bg-brand-50 text-brand-900 inline-flex items-center gap-1 rounded-[var(--radius-pill)] border px-2.5 py-0.5 text-sm font-semibold"
          >
            <AppIcon name="shield-check" :size="14" />
            Grade {{ grade }}
          </span>
          <span
            v-else-if="score !== null"
            class="border-status-partial-border bg-status-partial-bg text-status-partial-text inline-flex items-center rounded-[var(--radius-pill)] border px-2.5 py-0.5 text-xs font-medium"
          >
            Grade withheld
          </span>

          <p v-if="trend !== null" class="text-xs font-medium tabular-nums" :class="trendClass">
            <span aria-hidden="true">{{ trendGlyph }}</span>
            {{ Math.abs(trend.delta).toFixed(1) }} vs last
            <span class="sr-only">{{ trendLabel }}</span>
          </p>
          <p v-else-if="score !== null && previousScore === null" class="text-ink-500 text-xs">
            First scan
          </p>
        </div>
      </div>

      <svg
        v-if="score !== null"
        viewBox="0 0 100 8"
        preserveAspectRatio="none"
        role="img"
        :aria-label="gaugeLabel"
        class="mt-4 h-2 w-full"
      >
        <rect x="0" y="0" width="100" height="8" rx="2" class="fill-ink-200" />
        <rect x="0" y="0" :width="gaugeWidth" height="8" rx="2" class="fill-brand-500" />
      </svg>

      <p v-else class="text-ink-600 mt-3 text-sm">
        {{ coverageNote ?? 'This scan has not produced a score yet.' }}
      </p>

      <CoverageBanner
        v-if="coverage === 'partial' && coverageNote !== null"
        class="mt-3"
        :note="coverageNote"
        :withheld="grade === null"
      />

      <ul
        class="bg-ink-200/60 mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-control)] sm:grid-cols-5"
      >
        <li v-for="item in COUNT_ITEMS" :key="item.key" class="bg-surface">
          <NuxtLink
            :to="{ path: `/app/scans/${scanId}/findings`, query: { severity: item.key } }"
            class="hover:bg-ink-100 focus-visible:ring-brand-500 flex h-full flex-col gap-1 px-3 py-2.5 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
          >
            <span class="text-ink-500 inline-flex items-center gap-1.5 text-xs">
              <span class="h-1.5 w-1.5 rounded-full" :class="item.dot" aria-hidden="true" />
              {{ item.label }}
            </span>
            <span class="text-ink-900 text-lg font-semibold tabular-nums">{{
              counts[item.key]
            }}</span>
          </NuxtLink>
        </li>
      </ul>
    </template>
  </section>
</template>
