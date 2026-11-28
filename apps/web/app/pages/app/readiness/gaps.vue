<script setup lang="ts">
import ReadinessDataView from '~/components/readiness/ReadinessDataView.vue';
import type { ReadinessGap } from '~~/shared/readiness';

const route = useRoute();
const { data } = await useFetch<{ data: ReadinessGap[] }>(
  `/api/v1/scan/${String(route.query.scanId ?? route.params.scanId ?? '')}/gaps`,
);
const rows = computed(() =>
  (data.value?.data ?? []).map((gap) => ({
    Control: gap.controlCode,
    Section: gap.section,
    Verdict: gap.verdict,
    Reason: gap.reasonCode,
  })),
);
</script>

<template>
  <ReadinessDataView
    title="Compliance Gaps"
    summary="Non-passing controls recorded for this scan."
    :columns="['Control', 'Section', 'Verdict', 'Reason']"
    :rows="rows"
  />
</template>
