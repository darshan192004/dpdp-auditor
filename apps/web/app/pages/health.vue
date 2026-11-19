<script setup lang="ts">
// Public status surface (plan Task 5, P1-28): default layout, design §8 states.
import NewHealth from '~/components/new/NewHealth.vue';
import type { HealthStatus } from '~/types/health';

const { data: health, status } = useFetch<HealthStatus>('/api/health', { key: 'health' });
const services = computed(() => [{ name: 'API', healthy: health.value?.status === 'ok' }]);
</script>

<template>
  <NewHealth :services="services" :loading="status === 'pending'" />
</template>
