<script setup lang="ts">
import type { FindingView } from '~~/shared/findings';

import DsBadge from './DsBadge.vue';

defineProps<{ finding: FindingView }>();
defineEmits<{ select: [finding: FindingView] }>();
</script>

<template>
  <button
    type="button"
    class="bg-surface flex w-full items-start gap-3 rounded-[var(--radius-card)] p-3 text-left transition-shadow duration-[var(--motion-fast)] hover:shadow-[var(--shadow-popover)]"
    @click="$emit('select', finding)"
  >
    <DsBadge :tone="finding.severity">{{ finding.severity }}</DsBadge>
    <span class="min-w-0 flex-1">
      <span class="text-ink-900 block text-sm">{{ finding.message }}</span>
      <span class="text-ink-400 mt-1 block font-mono text-xs break-all">
        {{ finding.filePath }}:{{ finding.lineStart }} · {{ finding.evidence.hash }}
      </span>
    </span>
  </button>
</template>
