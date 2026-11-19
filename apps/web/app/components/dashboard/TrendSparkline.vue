<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ values: number[] }>();

const points = computed(() => {
  if (props.values.length < 2) return '';
  const min = Math.min(...props.values);
  const max = Math.max(...props.values);
  const span = Math.max(1, max - min);
  return props.values
    .map((value, index) => {
      const x = (index / (props.values.length - 1)) * 100;
      const y = 30 - ((value - min) / span) * 26;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
});
</script>

<template>
  <svg
    v-if="points"
    viewBox="0 0 100 32"
    preserveAspectRatio="none"
    class="h-8 w-full"
    role="img"
    aria-label="Score trend"
  >
    <polyline :points="points" fill="none" stroke="var(--color-brand-500)" stroke-width="2" />
  </svg>
</template>
