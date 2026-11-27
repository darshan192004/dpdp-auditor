<script setup lang="ts">
import ReadinessDataView from '~/components/readiness/ReadinessDataView.vue';
import type { FixPlan } from '~~/shared/readiness';

const route = useRoute();
const { data } = await useFetch<{ data: FixPlan }>(
  `/api/v1/scan/${String(route.params.scanId)}/fix-plan`,
);
const rows = computed(() =>
  (data.value?.data?.steps ?? []).map((step) => ({
    Control: step.controlCode,
    Section: step.section,
    Remedy: step.remedy,
  })),
);
</script>

<template>
  <ReadinessDataView
    title="Fix Plan"
    summary="Remediation steps from the active rule pack."
    :columns="['Control', 'Section', 'Remedy']"
    :rows="rows"
  />
</template>
