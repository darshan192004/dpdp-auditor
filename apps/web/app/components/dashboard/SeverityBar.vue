<script setup lang="ts">
import type { ScanCounts } from '~~/shared/scan';

const props = defineProps<{ counts: ScanCounts }>();

const LEVELS = [
  { key: 'critical', tone: 'bg-risk-critical-solid' },
  { key: 'high', tone: 'bg-risk-high-solid' },
  { key: 'medium', tone: 'bg-risk-medium-solid' },
  { key: 'low', tone: 'bg-risk-low-solid' },
  { key: 'info', tone: 'bg-risk-info-solid' },
] as const;

function width(key: keyof ScanCounts): string {
  const total = Math.max(1, props.counts.total);
  return `${(Number(props.counts[key]) / total) * 100}%`;
}
</script>

<template>
  <div data-testid="severity-bar">
    <div
      class="bg-ink-200 flex h-2 overflow-hidden rounded-[var(--radius-pill)]"
      role="img"
      :aria-label="`${counts.total} findings by severity`"
    >
      <div
        v-for="level in LEVELS"
        :key="level.key"
        :class="level.tone"
        :style="{ width: width(level.key) }"
      />
    </div>
    <p class="text-ink-400 mt-2 font-mono text-xs">{{ counts.total }} total findings</p>
    <dl class="mt-3 grid grid-cols-5 gap-2">
      <div v-for="level in LEVELS" :key="level.key">
        <dt class="text-ink-400 font-mono text-[10px] tracking-wider uppercase">{{ level.key }}</dt>
        <dd class="text-sm tabular-nums">{{ counts[level.key] }}</dd>
      </div>
    </dl>
  </div>
</template>
