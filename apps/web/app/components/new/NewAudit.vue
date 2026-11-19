<script setup lang="ts">
import DsCard from '~/components/ds/DsCard.vue';
import DsEmptyState from '~/components/ds/DsEmptyState.vue';

defineProps<{
  events: { id: string; action: string; createdAt: string }[];
  loading?: boolean;
  error?: string | null;
}>();
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold">Audit</h1>
    <DsEmptyState
      v-if="!loading && !error && events.length === 0"
      title="No audit events"
      class="mt-6"
    />
    <p v-else-if="loading" class="text-ink-400 mt-6 text-sm">Loading audit log…</p>
    <p v-else-if="error" role="alert" class="text-risk-critical-text mt-6 text-sm">{{ error }}</p>
    <div v-else class="mt-6 grid gap-2">
      <DsCard v-for="event in events" :key="event.id">
        <span class="text-sm">{{ event.action }}</span>
        <span class="text-ink-400 ml-3 font-mono text-xs">{{ event.createdAt }}</span>
      </DsCard>
    </div>
  </div>
</template>
