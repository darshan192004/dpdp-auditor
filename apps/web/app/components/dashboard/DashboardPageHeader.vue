<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>();
</script>

<template>
  <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div class="min-w-0">
      <h1 class="text-2xl font-semibold tracking-tight">{{ title }}</h1>
      <p v-if="subtitle" class="text-ink-400 mt-1 text-sm">{{ subtitle }}</p>
    </div>
    <div class="flex flex-wrap items-center gap-2"><slot name="actions" /></div>
  </header>
</template>
