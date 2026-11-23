<script setup lang="ts">
import { computed, ref } from 'vue';

import NewRemediationIndex from '~/components/new/NewRemediationIndex.vue';
import type { ScanListPage } from '~~/shared/scan';

const page = ref(1);
const { data, status, error } = await useFetch<{ data: ScanListPage }>(
  () => `/api/v1/scans?status=completed&page=${page.value}&pageSize=100`,
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
  <nav v-if="(data?.data.pagination.totalPages ?? 0) > 1" aria-label="Pagination">
    <button :disabled="page <= 1 || loading" @click="page--">Previous</button>
    <span>Page {{ page }} of {{ data?.data.pagination.totalPages }}</span>
    <button :disabled="page >= (data?.data.pagination.totalPages ?? 1) || loading" @click="page++">
      Next
    </button>
  </nav>
</template>
