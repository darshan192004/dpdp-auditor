<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: 'primary' | 'ghost';
    type?: 'button' | 'submit';
    disabled?: boolean;
  }>(),
  {
    tone: 'primary',
    type: 'button',
    disabled: false,
  },
);
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    class="focus-visible:ring-brand-500 rounded-[var(--radius-control)] px-4 py-2 text-sm font-medium transition-[background-color,transform] duration-[var(--motion-fast)] ease-[var(--ease-out)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
    :class="
      tone === 'primary'
        ? 'bg-brand-500 text-ink-50 hover:bg-brand-600'
        : 'border-ink-200 text-ink-700 hover:bg-surface-raised bg-transparent'
    "
  >
    <slot />
  </button>
</template>
