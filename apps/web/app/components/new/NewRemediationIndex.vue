<script setup lang="ts">
import DsCard from '~/components/ds/DsCard.vue';

defineProps<{ scans: { id: string; repository: string; status: string }[] }>();
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold">Remediation</h1>
    <p class="text-ink-400 mt-2 text-sm">Choose a completed scan to triage its findings.</p>
    <div class="mt-6 grid gap-2">
      <DsCard v-for="scan in scans" :key="scan.id">
        <NuxtLink :to="`/app/scans/${scan.id}/remediation`" class="flex justify-between gap-4">
          <span class="text-sm">{{ scan.repository }}</span>
          <span class="text-ink-400 font-mono text-xs">{{ scan.status }}</span>
        </NuxtLink>
      </DsCard>
    </div>
  </div>
</template>
