<script setup lang="ts">
import { computed } from 'vue';

import type { ScanCounts } from '~~/shared/scan';

// A queued scan returns `counts: {}`. Without a guard the aria-label and the
// numbers render the literal word "undefined" on first paint.
const props = defineProps<{ counts?: Partial<ScanCounts> | null }>();

const LEVELS = [
  { key: 'critical', tone: 'bg-risk-critical-solid' },
  { key: 'high', tone: 'bg-risk-high-solid' },
  { key: 'medium', tone: 'bg-risk-medium-solid' },
  { key: 'low', tone: 'bg-risk-low-solid' },
  { key: 'info', tone: 'bg-risk-info-solid' },
] as const;

const hasCounts = computed(() => Number.isFinite(props.counts?.total));

function value(key: keyof ScanCounts): string {
  const raw = props.counts?.[key];
  return hasCounts.value && Number.isFinite(raw) ? String(raw) : '—';
}

function width(key: keyof ScanCounts): string {
  const total = props.counts?.total;
  if (!hasCounts.value || !total) return '0%';
  return `${(Number(props.counts?.[key] ?? 0) / total) * 100}%`;
}
</script>

<template>
  <div data-testid="severity-bar">
    <div
      class="bg-ink-200 flex h-2 overflow-hidden rounded-[var(--radius-pill)]"
      role="img"
      :aria-label="
        hasCounts ? `${counts?.total} findings by severity` : 'Findings not available yet'
      "
    >
      <div
        v-for="level in LEVELS"
        :key="level.key"
        :class="level.tone"
        :style="{ width: width(level.key) }"
      />
    </div>
    <p class="text-ink-400 mt-2 font-mono text-xs">
      {{ hasCounts ? `${counts?.total} total findings` : 'Findings not available yet' }}
    </p>
    <dl class="mt-3 grid grid-cols-5 gap-2">
      <div v-for="level in LEVELS" :key="level.key">
        <dt class="text-ink-400 font-mono text-[10px] tracking-wider uppercase">{{ level.key }}</dt>
        <dd class="text-sm tabular-nums">{{ value(level.key) }}</dd>
      </div>
    </dl>
  </div>
</template>
