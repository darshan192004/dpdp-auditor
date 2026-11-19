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
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke="var(--color-brand-500)"
          stroke-width="8"
          stroke-linecap="round"
          :stroke-dasharray="dash"
        />
      </svg>
      <span
        class="absolute inset-0 flex items-center justify-center text-2xl font-semibold tabular-nums"
      >
        {{ score === null ? '—' : formatScore(score) }}
      </span>
    </div>
    <div class="min-w-0">
      <p class="text-ink-400 font-mono text-xs tracking-widest uppercase">DPDP score</p>
      <p v-if="shownGrade" class="mt-1 text-lg font-semibold">grade {{ shownGrade }}</p>
      <p v-else class="text-ink-500 mt-1 text-sm">grade withheld</p>
      <p class="text-ink-400 mt-1 text-xs">{{ coverage.state }} coverage</p>
      <p v-if="coverage.note" class="text-ink-500 mt-1 text-xs">{{ coverage.note }}</p>
    </div>
  </div>
</template>
