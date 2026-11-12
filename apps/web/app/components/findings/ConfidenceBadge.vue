<script setup lang="ts">
import { computed } from 'vue';

import type { FindingConfidence } from '~~/shared/findings';
import AppIcon from '../ui/AppIcon.vue';

const props = defineProps<{ confidence: FindingConfidence }>();

const META: Record<
  FindingConfidence,
  { label: string; icon: string; title: string; classes: string }
> = {
  direct: {
    label: 'Direct evidence',
    icon: 'target',
    title: 'Direct evidence from the scanner output.',
    classes: 'bg-confidence-direct-bg text-confidence-direct-text',
  },
  inferred: {
    label: 'Inferred',
    icon: 'wave',
    title: 'Inferred from configuration or code patterns.',
    classes: 'bg-confidence-inferred-bg text-confidence-inferred-text',
  },
  advisory: {
    label: 'Advisory',
    icon: 'lightbulb',
    title: 'Advisory: suggests a review, not proof of a failure.',
    classes: 'bg-confidence-advisory-bg text-confidence-advisory-text',
  },
};

const meta = computed(() => META[props.confidence]);
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2 py-0.5 text-xs font-medium whitespace-nowrap"
    :class="meta.classes"
    :title="meta.title"
  >
    <AppIcon :name="meta.icon" :size="12" />
    {{ meta.label }}
  </span>
</template>
