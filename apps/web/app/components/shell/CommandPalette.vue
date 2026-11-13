<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';

import AppIcon from '~/components/ui/AppIcon.vue';
import { APP_COMMANDS, filterCommands, groupCommands, type AppCommand } from '~/utils/commands';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [open: boolean] }>();

const dialog = ref<HTMLDialogElement | null>(null);
const input = ref<HTMLInputElement | null>(null);
const query = ref('');
const activeIndex = ref(0);

const results = computed(() => filterCommands(APP_COMMANDS, query.value));
const groups = computed(() => groupCommands(results.value));
const flat = computed(() => groups.value.flatMap((group) => group.commands));
const activeId = computed(() => flat.value[activeIndex.value]?.id ?? '');

function openDialog(): void {
  if (!dialog.value?.open) dialog.value?.showModal();
  input.value?.focus();
}

function reset(): void {
  query.value = '';
  activeIndex.value = 0;
}

// `post` flush means the dialog element is in the DOM when the prop changes.
watch(
  () => props.open,
  (open) => {
    if (open) {
      reset();
      openDialog();
      return;
    }
    if (dialog.value?.open) dialog.value.close();
  },
  { flush: 'post' },
);

// The component is async-loaded on first ⌘K, so it can mount already open.
onMounted(() => {
  if (!props.open) return;
  reset();
  openDialog();
});

function close(): void {
  emit('update:open', false);
}

function select(command: AppCommand | undefined): void {
  if (!command) return;
  close();
  void navigateTo(command.to);
}

function move(delta: number): void {
  if (flat.value.length === 0) return;
  activeIndex.value = (activeIndex.value + delta + flat.value.length) % flat.value.length;
  void nextTick(() => {
    document.getElementById(`command-${activeId.value}`)?.scrollIntoView({ block: 'nearest' });
  });
}

function onInputKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    move(1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    move(-1);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    select(flat.value[activeIndex.value]);
  }
}

function onInput(): void {
  activeIndex.value = 0;
}
</script>

<template>
  <dialog
    ref="dialog"
    aria-labelledby="command-palette-title"
    class="bg-surface-raised text-ink-800 backdrop:bg-ink-50/70 m-auto w-11/12 max-w-xl rounded-[var(--radius-card)] p-0 shadow-[var(--shadow-popover)] open:flex open:flex-col"
    @cancel.prevent="close"
    @close="close"
    @click.self="close"
  >
    <h2 id="command-palette-title" class="sr-only">Command palette</h2>

    <div class="border-ink-200 flex items-center gap-2.5 border-b px-4">
      <AppIcon name="search" :size="16" class="text-ink-400" />
      <input
        ref="input"
        v-model="query"
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls="command-results"
        aria-autocomplete="list"
        :aria-activedescendant="activeId ? `command-${activeId}` : undefined"
        placeholder="Search pages and actions…"
        class="text-ink-900 placeholder:text-ink-400 h-12 flex-1 bg-transparent text-sm outline-none"
        @keydown="onInputKeydown"
        @input="onInput"
      />
      <kbd
        class="border-ink-200 text-ink-500 rounded-[var(--radius-control)] border px-1.5 py-0.5 font-mono text-xs"
        >Esc</kbd
      >
    </div>

    <div
      v-if="results.length > 0"
      id="command-results"
      role="listbox"
      aria-label="Commands"
      class="max-h-80 overflow-y-auto p-2"
    >
      <div
        v-for="group in groups"
        :id="`command-group-${group.label}`"
        :key="group.label"
        role="group"
        :aria-labelledby="`command-group-label-${group.label}`"
      >
        <p
          :id="`command-group-label-${group.label}`"
          class="text-ink-400 px-2 pt-2 pb-1 font-mono text-xs tracking-widest uppercase"
        >
          {{ group.label }}
        </p>
        <div role="presentation">
          <div
            v-for="command in group.commands"
            :id="`command-${command.id}`"
            :key="command.id"
            role="option"
            :aria-selected="activeId === command.id"
            class="text-ink-700 flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-control)] px-2 py-2 text-left text-sm"
            :class="activeId === command.id ? 'bg-ink-100 text-ink-900' : 'hover:bg-ink-100/60'"
            @mouseenter="activeIndex = flat.findIndex((entry) => entry.id === command.id)"
            @click="select(command)"
          >
            <AppIcon :name="command.icon" :size="15" class="text-ink-400" />
            <span class="min-w-0 flex-1 truncate">{{ command.label }}</span>
            <span v-if="command.hint" class="text-ink-500 hidden truncate text-xs sm:block">
              {{ command.hint }}
            </span>
            <AppIcon
              v-if="activeId === command.id"
              name="chevron-right"
              :size="13"
              class="text-ink-400"
            />
          </div>
        </div>
      </div>
    </div>

    <p v-else class="text-ink-500 px-4 py-8 text-center text-sm">
      No page or action matches “{{ query }}”.
    </p>

    <div
      class="border-ink-200 text-ink-500 flex flex-wrap items-center gap-3 border-t px-4 py-2 font-mono text-xs"
    >
      <span><kbd class="text-ink-600">↑↓</kbd> navigate</span>
      <span><kbd class="text-ink-600">↵</kbd> open</span>
      <span class="ml-auto" aria-live="polite">{{ results.length }} results</span>
    </div>
  </dialog>
</template>
