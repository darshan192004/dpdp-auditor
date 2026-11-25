<script setup lang="ts">
import { useToasts } from '~/composables/useToasts';
import type { ToastTone } from '~/types/toast';

const { toasts, dismiss } = useToasts();

const TONE_CLASS: Record<ToastTone, string> = {
  success:
    'border-[var(--color-risk-low-border)] bg-[var(--color-risk-low-bg)] text-[var(--color-risk-low-text)]',
  error:
    'border-[var(--color-risk-critical-border)] bg-[var(--color-risk-critical-bg)] text-[var(--color-risk-critical-text)]',
  info: 'border-[var(--color-ink-300)] bg-[var(--color-surface-raised)] text-[var(--color-ink-800)]',
};
</script>

<template>
  <div class="fixed top-4 right-4 z-50 flex w-80 flex-col gap-2" role="status" aria-live="polite">
    <TransitionGroup name="toast" tag="div">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="rounded-[var(--radius-card)] border p-3 shadow-[var(--shadow-popover)]"
        :class="TONE_CLASS[toast.tone]"
      >
        <div class="flex items-start justify-between gap-2">
          <div>
            <p class="text-sm font-medium">{{ toast.title }}</p>
            <p v-if="toast.message" class="mt-1 text-xs opacity-80">{{ toast.message }}</p>
          </div>
          <button type="button" aria-label="Dismiss notification" @click="dismiss(toast.id)">
            ×
          </button>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity var(--motion-slow) var(--ease-out),
    transform var(--motion-slow) var(--ease-out);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active {
    transition: none;
  }
}
</style>
