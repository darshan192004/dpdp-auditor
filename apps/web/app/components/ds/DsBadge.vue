<script setup lang="ts">
import type { FindingSeverity } from '~~/shared/findings';

withDefaults(defineProps<{ tone?: FindingSeverity | 'info' }>(), { tone: 'info' });

const TONE_CLASS: Record<FindingSeverity | 'info', string> = {
  critical: 'bg-[var(--color-risk-critical-bg)] text-[var(--color-risk-critical-text)]',
  high: 'bg-[var(--color-risk-high-bg)] text-[var(--color-risk-high-text)]',
  medium: 'bg-[var(--color-risk-medium-bg)] text-[var(--color-risk-medium-text)]',
  low: 'bg-[var(--color-risk-low-bg)] text-[var(--color-risk-low-text)]',
  info: 'bg-[var(--color-surface-raised)] text-[var(--color-ink-700)]',
};
</script>

<template>
  <span
    class="rounded-[var(--radius-pill)] px-2 py-0.5 font-mono text-xs"
    :class="TONE_CLASS[tone]"
  >
    <slot />
  </span>
</template>
