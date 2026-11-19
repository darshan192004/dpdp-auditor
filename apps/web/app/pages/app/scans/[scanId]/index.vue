<script setup lang="ts">
import { computed } from 'vue';

import NewScanDetail from '~/components/new/NewScanDetail.vue';
import { useScanPolling } from '~/composables/useScanPolling';
import { coverageFor } from '~~/shared/scan';

const route = useRoute();
const scanId = computed(() => String(route.params.scanId));

/**
 * One fetch owns the scan detail. `useScanPolling` server-renders the first
 * response, then polls while the scan is active.
 */
const { scan, status } = await useScanPolling(scanId);

/** Coverage is only meaningful for a completed scan. */
const coverage = computed(() => {
  if (scan.value === null || scan.value.status !== 'completed') {
    return { state: 'full' as const, note: null };
  }
  return coverageFor(scan.value.coverage);
});
</script>

<template>
  <NewScanDetail
    :loading="status === 'pending'"
    :scan="
      scan === null
        ? null
        : {
            id: scan.id,
            status: scan.status,
            score: scan.score,
            grade: scan.grade,
            coverage: scan.status === 'completed' ? coverage.state : 'not scored',
            repository: scan.repository.fullName,
            note: coverage.note,
          }
    "
  />
</template>
