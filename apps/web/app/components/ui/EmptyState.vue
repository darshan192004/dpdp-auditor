<script setup lang="ts">
import AppIcon from './AppIcon.vue';

withDefaults(
  defineProps<{
    title: string;
    description?: string | null;
    actionLabel?: string | null;
    icon?: string;
  }>(),
  { icon: 'search', description: null, actionLabel: null },
);

const emit = defineEmits<{ action: [] }>();
</script>

<template>
  <div
    class="border-ink-200 flex flex-col items-start gap-3 rounded-[var(--radius-card)] border border-dashed bg-white px-6 py-10"
  >
    <AppIcon :name="icon" :size="20" class="text-ink-400" />
    <div>
      <p class="text-ink-900 text-sm font-medium">{{ title }}</p>
      <p v-if="description" class="text-ink-600 mt-1 max-w-prose text-sm">{{ description }}</p>
    </div>
    <button
      v-if="actionLabel"
      type="button"
      class="border-ink-200 text-ink-800 hover:bg-ink-50 focus-visible:ring-brand-500 inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border bg-white px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      @click="emit('action')"
    >
      {{ actionLabel }}
    </button>
  </div>
</template>
