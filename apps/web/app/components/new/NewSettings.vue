<script setup lang="ts">
import DsCard from '~/components/ds/DsCard.vue';
import DsEmptyState from '~/components/ds/DsEmptyState.vue';

defineProps<{ orgName: string; loading?: boolean; error?: string | null }>();
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold">Settings</h1>
    <p v-if="loading" class="text-ink-400 mt-6 text-sm">Loading settings…</p>
    <p v-else-if="error" role="alert" class="text-risk-critical-text mt-6 text-sm">{{ error }}</p>
    <DsEmptyState v-else-if="orgName === ''" title="No organisation" class="mt-6" />
    <DsCard v-else class="mt-6">
      <p class="text-ink-400 font-mono text-xs uppercase">Organisation</p>
      <p class="mt-1 text-sm">{{ orgName }}</p>
    </DsCard>
  </div>
</template>
