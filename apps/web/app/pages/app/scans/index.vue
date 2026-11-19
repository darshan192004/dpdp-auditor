<script setup lang="ts">
import { computed } from 'vue';

import NewScansList from '~/components/new/NewScansList.vue';
import type { ScanListPage } from '~~/shared/scan';

const request = await useFetch<{ data: ScanListPage }>('/api/v1/scans');

const items = computed(() => request.data.value?.data.items ?? []);
const loading = computed(() => request.status.value === 'pending');
</script>

<template>
  <NewScansList
    :scans="
      items.map((item) => ({
        id: item.id,
        repository: item.repositoryFullName,
        status: item.status,
        score: item.score,
      }))
    "
    :loading="loading"
  />
</template>
