<script setup lang="ts">
import { computed, ref } from 'vue';

import DsErrorState from '~/components/ds/DsErrorState.vue';
import NewScanDetail from '~/components/new/NewScanDetail.vue';
import { useScanPolling } from '~/composables/useScanPolling';
import { useToasts } from '~/composables/useToasts';

const route = useRoute();
const scanId = computed(() => String(route.params.scanId));
const { push } = useToasts();
const { scan, status, error, refresh } = await useScanPolling(scanId);

const cancelling = ref(false);
async function cancel(reason: string): Promise<void> {
  if (cancelling.value) return;
  cancelling.value = true;
  try {
    await $fetch(`/api/v1/scan/${scanId.value}/cancel`, { method: 'POST', body: { reason } });
    push('success', 'Scan cancelled', 'Partial results are still available.');
    await refresh();
  } catch {
    push('error', 'Cancel failed', 'The scan could not be cancelled. Try again.');
  } finally {
    cancelling.value = false;
  }
}
</script>

<template>
  <div>
    <DsErrorState v-if="error" message="This scan could not be loaded." @retry="refresh" />
    <NewScanDetail
      :scan="scan"
      :cancelling="cancelling"
      :loading="status === 'pending' && scan === null"
      @cancel="cancel"
    />
  </div>
</template>
