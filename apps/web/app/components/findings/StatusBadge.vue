<script setup lang="ts">
import { computed } from 'vue';

import type { FindingStatus } from '~~/shared/findings';
import AppIcon from '../ui/AppIcon.vue';

const props = defineProps<{ status: FindingStatus }>();

const META: Record<FindingStatus, { label: string; icon: string; classes: string }> = {
  open: {
    label: 'Open',
    icon: 'circle',
    classes: 'bg-risk-info-bg text-risk-info-text border-risk-info-border',
  },
  false_positive: {
    label: 'False positive',
    icon: 'x',
    classes: 'bg-status-na-bg text-status-na-text border-status-na-border',
  },
  accepted_risk: {
    label: 'Accepted risk',
    icon: 'alert-triangle',
    classes: 'bg-risk-medium-bg text-risk-medium-text border-risk-medium-border',
  },
  fixed: {
    label: 'Fixed',
    icon: 'check',
    classes: 'bg-status-compliant-bg text-status-compliant-text border-status-compliant-border',
  },
  reopened: {
    label: 'Reopened',
    icon: 'rotate-ccw',
    classes: 'bg-risk-high-bg text-risk-high-text border-risk-high-border',
  },
};

const meta = computed(() => META[props.status]);
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
