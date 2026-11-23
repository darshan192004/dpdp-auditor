<script setup lang="ts">
const props = defineProps<{ options: string[]; modelValue: string[] }>();
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>();

function toggle(option: string): void {
  const next = props.modelValue.includes(option)
    ? props.modelValue.filter((item) => item !== option)
    : [...props.modelValue, option];
  emit('update:modelValue', next);
}
</script>

<template>
  <div class="flex flex-wrap gap-2" role="group" aria-label="Filter findings">
    <button
      v-for="option in options"
      :key="option"
      type="button"
      class="border-ink-300 text-ink-400 aria-pressed:bg-brand-500 aria-pressed:text-ink-50 rounded-[var(--radius-pill)] border px-3 py-1 font-mono text-xs"
      :aria-pressed="modelValue.includes(option)"
      @click="toggle(option)"
    >
      {{ option }}
    </button>
  </div>
</template>
