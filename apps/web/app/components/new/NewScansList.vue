<script setup lang="ts">
import DsCard from '~/components/ds/DsCard.vue';
import DsSkeleton from '~/components/ds/DsSkeleton.vue';

defineProps<{
  scans: { id: string; repository: string; status: string; score: number | null }[];
  loading?: boolean;
}>();
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold">Scans</h1>
    <DsSkeleton v-if="loading" class="mt-6 h-24" />
    <p v-else-if="scans.length === 0" class="text-ink-400 mt-6 text-sm">No scans found.</p>
    <div v-else class="mt-6 grid gap-3">
      <DsCard v-for="scan in scans" :key="scan.id">
        <NuxtLink :to="`/app/scans/${scan.id}`" class="flex items-center justify-between gap-4">
          <span class="text-ink-900 text-sm">{{ scan.repository }}</span>
          <span class="text-ink-400 font-mono text-xs">
            {{ scan.status }} · {{ scan.score === null ? '—' : scan.score.toFixed(1) }}
          </span>
        </NuxtLink>
      </DsCard>
    </div>
  </div>
</template>
