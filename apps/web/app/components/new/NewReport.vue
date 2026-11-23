<script setup lang="ts">
import DsCard from '~/components/ds/DsCard.vue';
import DownloadButton from '~/components/report/DownloadButton.vue';

defineProps<{ scanId: string; canExport?: boolean }>();
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold">Report</h1>
    <DsCard class="mt-6">
      <p class="text-ink-400 font-mono text-xs">PDF export for scan {{ scanId }}</p>
      <DownloadButton class="mt-4" :scan-id="scanId" :can-export="canExport ?? true" />
    </DsCard>
  </div>
</template>
