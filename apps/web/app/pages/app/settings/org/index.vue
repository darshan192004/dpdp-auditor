<script setup lang="ts">
import { computed } from 'vue';

import NewSettings from '~/components/new/NewSettings.vue';
import type { OrgDetail } from '~~/shared/org';

const request = await useFetch<{ data: OrgDetail }>('/api/v1/org');

const org = computed(() => request.data.value?.data ?? null);
const loading = computed(() => request.status.value === 'pending');
</script>

<template>
  <NewSettings :org-name="org?.name ?? ''" :loading="loading" />
</template>
