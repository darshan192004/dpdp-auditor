<script setup lang="ts">
import AppIcon from '../ui/AppIcon.vue';

withDefaults(
  defineProps<{
    note: string;
    withheld?: boolean;
  }>(),
  { withheld: false },
);
</script>

<template>
  <div
    role="status"
    class="border-status-partial-border bg-status-partial-bg text-status-partial-text flex items-start gap-2 rounded-[var(--radius-card)] border px-3 py-2 text-xs"
  >
    <AppIcon name="alert-triangle" :size="14" class="mt-0.5" />
    <p>
      {{ note }}
      <span v-if="withheld" class="font-medium">Grade withheld until every scanner completes.</span>
    </p>
  </div>
</template>
