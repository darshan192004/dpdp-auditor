<script setup lang="ts">
withDefaults(defineProps<{ title?: string; message?: string }>(), {
  title: 'Nothing here yet',
  message: '',
});
</script>

<template>
  <div class="bg-surface rounded-[var(--radius-card)] p-8 text-center">
    <p class="text-ink-900 text-sm font-medium">{{ title }}</p>
    <p v-if="message" class="text-ink-400 mt-2 text-sm">{{ message }}</p>
  </div>
</template>
