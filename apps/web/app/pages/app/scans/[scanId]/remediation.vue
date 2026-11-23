<script setup lang="ts">
import { computed } from 'vue';

import RemediationWorkspace from '~/components/new/RemediationWorkspace.vue';
import type { FindingsPage } from '~~/shared/findings';

const route = useRoute();
const scanId = computed(() => String(route.params.scanId));
const { data, refresh } = await useFetch<FindingsPage>(
  () => `/api/v1/scan/${scanId.value}/findings?page=1&pageSize=100`,
);
const findings = computed(() => data.value?.data ?? []);
</script>

<template>
  <RemediationWorkspace :findings="findings" @triaged="refresh" />
</template>
