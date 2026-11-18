<script setup lang="ts">
import DsCard from '~/components/ds/DsCard.vue';

defineProps<{ stats: { label: string; value: string | number }[] }>();
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold">Overview</h1>
    <div class="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <DsCard v-for="stat in stats" :key="stat.label">
        <p class="text-ink-400 font-mono text-xs">{{ stat.label }}</p>
        <p class="text-ink-900 mt-2 text-2xl font-semibold tabular-nums">{{ stat.value }}</p>
      </DsCard>
    </div>
  </div>
</template>
