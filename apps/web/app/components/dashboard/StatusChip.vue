<script setup lang="ts">
import { SCAN_STATUS_LABELS, type ScanStatus } from '~~/shared/scan';

defineProps<{ status: ScanStatus }>();

const TONES: Record<ScanStatus, string> = {
  queued: 'bg-ink-100 text-ink-600',
  cloning: 'bg-brand-100 text-brand-500',
  scanning: 'bg-brand-100 text-brand-500',
  mapping: 'bg-brand-100 text-brand-500',
  completed: 'bg-status-compliant-bg text-status-compliant-text',
  failed: 'bg-risk-critical-bg text-risk-critical-text',
  cancelled: 'bg-ink-100 text-ink-500',
  expired: 'bg-ink-100 text-ink-500',
};
</script>

<template>
  <span
    :data-status="status"
    :class="TONES[status]"
    class="rounded-[var(--radius-pill)] px-2 py-1 font-mono text-[11px] whitespace-nowrap"
  >
    {{ SCAN_STATUS_LABELS[status] }}
  </span>
</template>
