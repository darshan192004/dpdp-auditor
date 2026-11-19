<script setup lang="ts">
import { computed } from 'vue';

import NewFindings from '~/components/new/NewFindings.vue';
import type { FindingView, FindingsPage } from '~~/shared/findings';

const route = useRoute();
const scanId = computed(() => String(route.params.scanId));

const request = await useFetch<FindingsPage>(() => `/api/v1/scan/${scanId.value}/findings`);
const findings = computed<FindingView[]>(() => request.data.value?.data ?? []);
</script>

<template>
  <NewFindings :findings="findings" />
</template>
