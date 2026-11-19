<script setup lang="ts">
import { computed } from 'vue';

import DsErrorState from '~/components/ds/DsErrorState.vue';
import NewScanDetail from '~/components/new/NewScanDetail.vue';
import { useScanPolling } from '~/composables/useScanPolling';
import { useToasts } from '~/composables/useToasts';

const route = useRoute();
const scanId = computed(() => String(route.params.scanId));
const { push } = useToasts();
const { scan, status, error, refresh } = await useScanPolling(scanId);

async function cancel(reason: string): Promise<void> {
  try {
    await $fetch(`/api/v1/scan/${scanId.value}/cancel`, { method: 'POST', body: { reason } });
    push('success', 'Scan cancelled', 'Partial results are still available.');
    await refresh();
  } catch {
    push('error', 'Cancel failed', 'The scan could not be cancelled. Try again.');
  }
}
</script>

<template>
  <div>
    <DsErrorState v-if="error" message="This scan could not be loaded." @retry="refresh" />
    <NewScanDetail :scan="scan" :loading="status === 'pending'" @cancel="cancel" />
  </div>
</template>
