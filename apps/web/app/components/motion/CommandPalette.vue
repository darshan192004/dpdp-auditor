<script setup lang="ts">
import { AnimatePresence, motion } from 'motion-v';
import { computed, nextTick, ref, useId, watch } from 'vue';

import {
  ENTER_MOTION,
  SUBTLE_MOTION,
  useReadinessMotion,
} from '../../composables/useReadinessMotion';
import type { PaletteItem } from './palette';

const props = defineProps<{ open: boolean; items: readonly PaletteItem[] }>();
const emit = defineEmits<{ close: []; navigate: [item: PaletteItem] }>();

const { reduceMotion } = useReadinessMotion();
const listboxId = useId();
const query = ref('');
const active = ref(0);
const input = ref<HTMLInputElement | null>(null);
let previouslyFocused: HTMLElement | null = null;

const filtered = computed(() => {
  const term = query.value.trim().toLowerCase();
  return term === ''
    ? props.items
    : props.items.filter((item) => `${item.label} ${item.hint ?? ''}`.toLowerCase().includes(term));
});

watch(query, () => {
  active.value = 0;
});

watch(
  () => props.open,
  async (open) => {
    if (open) {
      previouslyFocused =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      await nextTick();
      input.value?.focus();
      return;
    }
    query.value = '';
    active.value = 0;
    await nextTick();
    previouslyFocused?.focus();
    previouslyFocused = null;
  },
);

function move(delta: number): void {
  const count = filtered.value.length;
  if (count === 0) return;
  active.value = (active.value + delta + count) % count;
}

function choose(item: PaletteItem | undefined): void {
  if (!item) return;
  emit('navigate', item);
  emit('close');
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    move(1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    move(-1);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    choose(filtered.value[active.value]);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
  }
}

/** Keep Tab inside the dialog, moving through focusable elements in DOM order. */
function onDialogKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Tab') return;
  const dialog = event.currentTarget;
  if (!(dialog instanceof HTMLElement)) return;
  const focusable = Array.from(
    dialog.querySelectorAll<HTMLElement>('input, button, [href], [tabindex]:not([tabindex="-1"])'),
  );
  if (focusable.length === 0) return;
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;

  if (!dialog.contains(document.activeElement)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
</script>

<template>
  <AnimatePresence>
    <motion.div
      v-if="props.open"
      class="bg-overlay fixed inset-0 z-50 flex items-start justify-center p-4 pt-[15vh]"
      :initial="reduceMotion ? false : { opacity: 0 }"
      :animate="reduceMotion ? {} : { opacity: ENTER_MOTION.opacity }"
      :exit="reduceMotion ? {} : { opacity: 0 }"
      :transition="reduceMotion ? { duration: 0 } : SUBTLE_MOTION"
      role="presentation"
      @click.self="emit('close')"
      @keydown="onDialogKeydown"
    >
      <motion.div
        class="bg-surface border-ink-200 w-full max-w-xl rounded-[var(--radius-card)] border shadow-[var(--shadow-popover)]"
        :initial="reduceMotion ? false : { opacity: 0, y: -8, scale: 0.98 }"
        :animate="reduceMotion ? {} : ENTER_MOTION"
        :exit="reduceMotion ? {} : { opacity: 0, y: -8, scale: 0.98 }"
        :transition="reduceMotion ? { duration: 0 } : SUBTLE_MOTION"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <input
          ref="input"
          v-model="query"
          class="border-ink-200 focus-visible:ring-brand-500 w-full rounded-t-[var(--radius-card)] border-b bg-transparent px-4 py-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
          type="text"
          placeholder="Search pages"
          aria-label="Search pages"
          :aria-controls="listboxId"
          @keydown="onKeydown"
        />
        <ul :id="listboxId" role="listbox" class="max-h-72 overflow-auto p-2">
          <li
            v-for="(item, index) in filtered"
            :key="item.id"
            role="option"
            tabindex="0"
            :aria-selected="index === active"
            class="focus-visible:ring-brand-500 rounded-[var(--radius-control)] px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
            :class="index === active ? 'bg-ink-100' : ''"
            @mouseenter="active = index"
            @focus="active = index"
            @click="choose(item)"
            @keydown.enter.prevent="choose(item)"
          >
            <span class="text-ink-800">{{ item.label }}</span>
            <span v-if="item.hint" class="text-ink-400 ml-2 text-xs">{{ item.hint }}</span>
          </li>
        </ul>
      </motion.div>
    </motion.div>
  </AnimatePresence>
</template>
