<script setup lang="ts">
withDefaults(
  defineProps<{
    message: string;
    requestId?: string | null;
    retryLabel?: string;
  }>(),
  { requestId: null, retryLabel: 'Try again' },
);

const emit = defineEmits<{ retry: [] }>();
</script>

<template>
  <div
    role="alert"
    class="border-risk-critical-border bg-risk-critical-bg text-risk-critical-text rounded-[var(--radius-card)] border px-4 py-3 text-sm"
  >
    <p class="font-medium">{{ message }}</p>
    <p v-if="requestId" class="mt-1 font-mono text-xs opacity-80">Request {{ requestId }}</p>
    <button
      type="button"
      class="focus-visible:ring-risk-critical-solid mt-2 inline-flex items-center rounded-[var(--radius-control)] border border-current px-3 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      @click="emit('retry')"
    >
      {{ retryLabel }}
    </button>
  </div>
</template>
