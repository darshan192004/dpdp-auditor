<script setup lang="ts">
// Public status surface (plan Task 5, P1-28): default layout, design §8 states.
import HealthPanel from '~/components/HealthPanel.vue';
import type { HealthStatus } from '~/types/health';

const { data: health, status } = useFetch<HealthStatus>('/api/health', { key: 'health' });
</script>

<template>
  <main id="main" tabindex="-1" class="mx-auto w-full max-w-3xl px-6 py-16">
    <HealthPanel :health="health ?? null" :pending="status === 'pending'" />
  </main>
</template>
