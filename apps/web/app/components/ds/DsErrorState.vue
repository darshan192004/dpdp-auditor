<script setup lang="ts">
import DsButton from './DsButton.vue';

withDefaults(defineProps<{ message?: string; requestId?: string }>(), {
  message: 'Something went wrong.',
  requestId: '',
});

defineEmits<{ retry: [] }>();
</script>

<template>
  <div role="alert" class="bg-risk-critical-bg rounded-[var(--radius-card)] p-4">
    <p class="text-risk-critical-text text-sm">{{ message }}</p>
    <p v-if="requestId" class="text-ink-400 mt-1 font-mono text-xs">ID {{ requestId }}</p>
    <DsButton class="mt-3" @click="$emit('retry')">Retry</DsButton>
  </div>
</template>
