<script setup lang="ts">
import DsBadge from '~/components/ds/DsBadge.vue';
import DsCard from '~/components/ds/DsCard.vue';
import DsEmptyState from '~/components/ds/DsEmptyState.vue';

defineProps<{
  services: { name: string; healthy: boolean }[];
  loading?: boolean;
  error?: string | null;
}>();
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold">Health</h1>
    <DsEmptyState
      v-if="!loading && !error && services.length === 0"
      title="No services reported"
      class="mt-6"
    />
    <p v-else-if="loading" class="text-ink-400 mt-6 text-sm">Checking services…</p>
    <p v-else-if="error" role="alert" class="text-risk-critical-text mt-6 text-sm">{{ error }}</p>
    <div v-else class="mt-6 grid gap-2">
      <DsCard v-for="service in services" :key="service.name">
        <span class="text-sm">{{ service.name }}</span>
        <DsBadge :tone="service.healthy ? 'low' : 'high'" class="ml-3">
          {{ service.healthy ? 'healthy' : 'unhealthy' }}
        </DsBadge>
      </DsCard>
    </div>
  </div>
</template>
