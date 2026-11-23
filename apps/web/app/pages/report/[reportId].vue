<script setup lang="ts">
/**
 * P5-22: accessible HTML report preview (docs/api.md 10.6). Same view model
 * the PDF renderer consumes, so the numbers on screen equal the numbers in
 * the PDF. Print layout gives it A4 geometry with no app chrome.
 */
import { computed } from 'vue';

import DsSkeleton from '~/components/ds/DsSkeleton.vue';
import NewReport from '~/components/new/NewReport.vue';
import type { ReportViewModel } from '~~/shared/report';

definePageMeta({ layout: 'print' });

const route = useRoute();
const reportId = computed(() => String(route.params.reportId));

const { data, status, error } = await useFetch<{ data: ReportViewModel }>(
  () => `/api/v1/report/pdf/${reportId.value}/view`,
);

const report = computed(() => data.value?.data ?? null);
const loading = computed(() => status.value === 'pending');
const errorMessage = computed(() => {
  const data = error.value?.data as { error?: { message?: string } } | undefined;
  return data?.error?.message ?? error.value?.message ?? null;
});
</script>

<template>
  <DsSkeleton v-if="loading" class="h-32" />
  <NewReport v-else :report="report" :error="errorMessage" />
</template>
