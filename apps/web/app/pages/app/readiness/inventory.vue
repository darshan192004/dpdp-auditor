<script setup lang="ts">
import ReadinessDataView from '~/components/readiness/ReadinessDataView.vue';
import type { ReadinessInventory } from '~~/shared/readiness';

const route = useRoute();
const { data } = await useFetch<{ data: ReadinessInventory }>(
  `/api/v1/scan/${String(route.query.scanId ?? route.params.scanId ?? '')}/inventory`,
);
const signals = computed(() => data.value?.data?.signals ?? []);
const rows = computed(() =>
  signals.value.map((signal) => ({
    Detector: signal.detector,
    Token: signal.token,
    Path: signal.path,
  })),
);
</script>

<template>
  <ReadinessDataView
    title="Data Inventory"
    summary="Detected field names, routes, dependencies, and regions."
    :columns="['Detector', 'Token', 'Path']"
    :rows="rows"
  />
</template>
