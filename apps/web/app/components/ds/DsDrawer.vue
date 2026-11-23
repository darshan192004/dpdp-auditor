<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{ open: boolean; title: string }>();
const emit = defineEmits<{ close: [] }>();

const panel = ref<HTMLElement | null>(null);
const heading = ref<HTMLElement | null>(null);
let previouslyFocused: HTMLElement | null = null;

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// The heading takes focus on entry, matching the finding drawer's behaviour.
// Restore it to the trigger on exit so keyboard users resume where they left off.
watch(
  () => props.open,
  async (open) => {
    if (!import.meta.client) return;
    if (open) {
      previouslyFocused = document.activeElement as HTMLElement | null;
      await nextTick();
      heading.value?.focus();
    } else {
      previouslyFocused?.focus();
      previouslyFocused = null;
    }
  },
);

function onKeydown(event: KeyboardEvent): void {
  if (!props.open) return;
  if (event.key === 'Escape') {
    emit('close');
    return;
  }
  if (event.key !== 'Tab' || !panel.value) return;

  const controls = [...panel.value.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => element.getClientRects().length > 0,
  );
  const focusOrder = heading.value ? [heading.value, ...controls] : controls;
  if (focusOrder.length === 0) {
    event.preventDefault();
    return;
  }

  const first = focusOrder[0]!;
  const last = focusOrder[focusOrder.length - 1]!;
  if (
    event.shiftKey &&
    (document.activeElement === first || document.activeElement === controls[0])
  ) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  if (props.open) {
    previouslyFocused = document.activeElement as HTMLElement | null;
    heading.value?.focus();
  }
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <Transition name="drawer">
    <div
      v-if="open"
      class="fixed inset-0 z-40 flex justify-end"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
    >
      <div
        class="absolute inset-0"
        :style="{ background: 'var(--color-overlay)' }"
        @click="emit('close')"
      />
      <div
        ref="panel"
        class="bg-surface-raised relative h-full w-full max-w-lg overflow-y-auto p-6 shadow-[var(--shadow-popover)]"
      >
        <div class="flex items-start justify-between gap-4">
          <h2 ref="heading" tabindex="-1" class="text-xl font-semibold focus:outline-none">
            {{ title }}
          </h2>
          <button type="button" aria-label="Close drawer" @click="emit('close')">×</button>
        </div>
        <slot />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity var(--motion-slow) var(--ease-out);
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
</style>
