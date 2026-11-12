<script setup lang="ts">
import { computed } from 'vue';

import type { FindingSeverity } from '~~/shared/findings';
import AppIcon from '../ui/AppIcon.vue';

const props = defineProps<{ severity: FindingSeverity }>();

const META: Record<FindingSeverity, { label: string; icon: string; classes: string }> = {
  critical: {
    label: 'Critical',
    icon: 'shield-alert',
    classes: 'bg-risk-critical-bg text-risk-critical-text border-risk-critical-border',
  },
  high: {
    label: 'High',
    icon: 'alert-triangle',
    classes: 'bg-risk-high-bg text-risk-high-text border-risk-high-border',
  },
  medium: {
    label: 'Medium',
    icon: 'alert-circle',
    classes: 'bg-risk-medium-bg text-risk-medium-text border-risk-medium-border',
  },
  low: {
    label: 'Low',
    icon: 'info',
    classes: 'bg-risk-low-bg text-risk-low-text border-risk-low-border',
  },
  info: {
    label: 'Info',
    icon: 'circle',
    classes: 'bg-risk-info-bg text-risk-info-text border-risk-info-border',
  },
};

const meta = computed(() => META[props.severity]);
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-[var(--radius-pill)] border px-2 py-0.5 text-xs font-medium whitespace-nowrap"
    :class="meta.classes"
  >
    <AppIcon :name="meta.icon" :size="12" />
    {{ meta.label }}
  </span>
</template>
