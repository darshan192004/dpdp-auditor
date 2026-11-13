<script setup lang="ts">
import { ref } from 'vue';

import type { FindingStatus, FindingView } from '~~/shared/findings';
import AppIcon from '../ui/AppIcon.vue';
import FindingDetail from './FindingDetail.vue';

withDefaults(
  defineProps<{
    open: boolean;
    finding: FindingView | null;
    role: string;
    submitting?: boolean;
  }>(),
  { submitting: false },
);

const emit = defineEmits<{
  'update:open': [open: boolean];
  triage: [draft: { status: FindingStatus; note?: string; externalUrl?: string }];
  opened: [];
}>();

const panel = ref<HTMLElement | null>(null);

// design.md §5.4: focus lands on the drawer heading, not the close button.
// Reka autofocuses the first tabbable element, so we correct it after enter.
function focusHeading(): void {
  const heading = panel.value?.querySelector<HTMLElement>('#finding-title');
  heading?.focus();
  emit('opened');
}
</script>

<template>
  <USlideover
    :open="open"
    :title="finding?.message ?? 'Finding'"
    :ui="{ content: 'w-full sm:max-w-[560px]' }"
    @update:open="emit('update:open', $event)"
    @after:enter="focusHeading"
  >
    <template #content="{ close }">
      <div class="border-ink-200 flex items-center justify-between gap-3 border-b px-5 py-3">
        <p class="text-ink-500 text-xs font-medium tracking-wide uppercase">Finding</p>
        <button
          type="button"
          class="text-ink-600 hover:bg-ink-100 hover:text-ink-900 focus-visible:ring-brand-500 -mr-2 inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          aria-label="Close finding"
          @click="close"
        >
          <AppIcon name="x" :size="16" />
        </button>
      </div>

      <div ref="panel" class="min-h-0 flex-1 overflow-y-auto">
        <FindingDetail
          v-if="finding"
          :finding="finding"
          :role="role"
          :submitting="submitting"
          @triage="emit('triage', $event)"
        />
      </div>
    </template>
  </USlideover>
</template>
