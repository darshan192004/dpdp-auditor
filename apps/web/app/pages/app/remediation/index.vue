<script setup lang="ts">
import { computed } from 'vue';

import NewRemediationIndex from '~/components/new/NewRemediationIndex.vue';
import type { ScanListPage } from '~~/shared/scan';

const { data, status, error } = await useFetch<{ data: ScanListPage }>(
  '/api/v1/scans?page=1&pageSize=100',
);

const scans = computed(() => data.value?.data.items ?? []);
const loading = computed(() => status.value === 'pending');
const loadError = computed(() => {
  if (!error.value) return null;
  const failure = error.value as {
    data?: { error?: { message?: string; requestId?: string } };
  };
  const message = failure.data?.error?.message ?? 'Scans could not be loaded.';
  const requestId = failure.data?.error?.requestId;
  return requestId ? `${message} (request ${requestId})` : message;
});
</script>

<template>
  <NewRemediationIndex :scans="scans" :loading="loading" :error="loadError" />
</template>
