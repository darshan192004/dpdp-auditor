<script setup lang="ts">
import type { Options, VariantType } from 'motion-v';
import { motion } from 'motion-v';
import { computed } from 'vue';

import { useReadinessMotion } from '../../composables/useReadinessMotion';

withDefaults(
  defineProps<{
    label: string;
    value: string;
    caption: string;
    tone?: 'neutral' | 'warning' | 'gap';
    testId?: string;
  }>(),
  { tone: 'neutral', testId: 'metric-tile' },
);

const { reduceMotion, enter } = useReadinessMotion();

// The shared vocabulary widens values to `unknown`; narrow them at the motion
// boundary. `animate` becomes an empty target under reduced motion so nothing runs.
const initial = computed(() => enter.value.initial as boolean | VariantType);
const animate = computed<VariantType>(() =>
  enter.value.animate === false ? {} : (enter.value.animate as VariantType),
);
const transition = computed(() => enter.value.transition as NonNullable<Options['transition']>);

const TONE_CLASS = {
  neutral: 'border-ink-200',
  warning: 'border-status-partial-border',
  gap: 'border-status-noncompliant-border',
} as const;
</script>

<template>
  <!-- motion-v gesture props are camelCase by API contract. -->
  <!-- eslint-disable vue/attribute-hyphenation -->
  <motion.div
    :data-testid="testId"
    class="motion-enter bg-surface min-w-0 rounded-[var(--radius-card)] border p-4 shadow-[var(--shadow-card)]"
    :class="TONE_CLASS[tone]"
    :initial="initial"
    :animate="animate"
    :transition="transition"
    :whileHover="reduceMotion ? {} : { y: -2 }"
  >
    <p class="text-ink-400 font-mono text-xs tracking-widest uppercase">{{ label }}</p>
    <p class="text-ink-900 mt-2 text-2xl font-semibold tabular-nums">{{ value }}</p>
    <p class="text-ink-500 mt-1 text-xs">{{ caption }}</p>
  </motion.div>
</template>
