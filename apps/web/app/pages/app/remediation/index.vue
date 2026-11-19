<script setup lang="ts">
import { computed } from 'vue';

import NewRemediationIndex from '~/components/new/NewRemediationIndex.vue';
import type { ScanListPage } from '~~/shared/scan';

const { data } = await useFetch<{ data: ScanListPage }>('/api/v1/scans?page=1');
const scans = computed(() =>
  (data.value?.data.items ?? []).map((scan) => ({
    id: scan.id,
    repository: scan.repositoryFullName,
    status: scan.status,
  })),
);
</script>

<template>
  <NewRemediationIndex :scans="scans" />
</template>
