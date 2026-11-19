<script setup lang="ts">
import DsCard from '~/components/ds/DsCard.vue';
import DsEmptyState from '~/components/ds/DsEmptyState.vue';

defineProps<{
  rules: { code: string; title: string }[];
  loading?: boolean;
  error?: string | null;
}>();
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold">Rules</h1>
    <DsEmptyState
      v-if="!loading && !error && rules.length === 0"
      title="No rules found"
      class="mt-6"
    />
    <p v-else-if="loading" class="text-ink-400 mt-6 text-sm">Loading rules…</p>
    <p v-else-if="error" role="alert" class="text-risk-critical-text mt-6 text-sm">{{ error }}</p>
    <div v-else class="mt-6 grid gap-2">
      <DsCard v-for="rule in rules" :key="rule.code">
        <span class="font-mono text-xs">{{ rule.code }}</span>
        <p class="mt-1 text-sm">{{ rule.title }}</p>
      </DsCard>
    </div>
  </div>
</template>
