<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';

defineProps<{ open: boolean; title: string }>();
const emit = defineEmits<{ close: [] }>();

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close');
}

onMounted(() => window.addEventListener('keydown', onKeydown));
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
        class="bg-surface-raised relative h-full w-full max-w-lg overflow-y-auto p-6 shadow-[var(--shadow-popover)]"
      >
        <div class="flex items-start justify-between gap-4">
          <h2 class="text-xl font-semibold">{{ title }}</h2>
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
