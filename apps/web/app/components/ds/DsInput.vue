<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    type?: string;
    placeholder?: string;
  }>(),
  {
    type: 'text',
    placeholder: '',
  },
);

const model = defineModel<string>({ default: '' });
</script>

<template>
  <label class="block">
    <span class="text-ink-400 font-mono text-xs tracking-widest uppercase">{{ label }}</span>
    <input
      v-model="model"
      :type="type"
      :placeholder="placeholder"
      class="bg-surface-raised text-ink-900 border-ink-300 focus-visible:ring-brand-500 mt-2 w-full rounded-[var(--radius-control)] border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
    />
  </label>
</template>
