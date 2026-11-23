<script setup lang="ts">
import DsBadge from './DsBadge.vue';

defineProps<{
  score: number | null;
  grade: string | null;
  coverage: string;
  findingsHref: string;
}>();
</script>

<template>
  <div class="bg-surface rounded-[var(--radius-card)] p-4 shadow-[var(--shadow-card)]">
    <div class="flex items-end gap-4">
      <span class="score-value text-ink-900 text-4xl leading-none font-semibold tabular-nums">
        {{ score === null ? '—' : score.toFixed(1) }}
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

<style scoped>
.score-value {
  animation: score-rise var(--motion-slow) var(--ease-out) both;
}

@keyframes score-rise {
  from {
    opacity: 0;
    transform: translateY(6px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
