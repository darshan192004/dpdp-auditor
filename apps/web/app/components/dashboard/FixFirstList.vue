<script setup lang="ts">
import { computed } from 'vue';
import type { FindingSeverity, FindingView } from '~~/shared/findings';

const props = withDefaults(defineProps<{ findings: FindingView[]; limit?: number }>(), {
  limit: 5,
});
const emit = defineEmits<{ select: [finding: FindingView] }>();

const RANK: Record<FindingSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const ranked = computed(() =>
  [...props.findings].sort((a, b) => RANK[a.severity] - RANK[b.severity]).slice(0, props.limit),
);
</script>

<template>
  <section aria-labelledby="fix-first-heading" class="min-w-0">
    <h2
      id="fix-first-heading"
      class="text-ink-400 mb-3 font-mono text-xs tracking-widest uppercase"
    >
      Fix these first
    </h2>
    <ul class="divide-ink-200 border-ink-200 divide-y rounded-[var(--radius-card)] border">
      <li v-for="finding in ranked" :key="finding.id">
        <button
          type="button"
          class="hover:bg-ink-100 flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          @click="emit('select', finding)"
        >
          <span class="min-w-0">
            <span class="block truncate text-sm">{{ finding.message }}</span>
            <span class="text-ink-400 mt-1 block font-mono text-[11px]">
              {{ finding.severity }} · {{ finding.filePath }} ·
              {{ finding.dpdpa?.code ?? 'unmapped' }}
            </span>
          </span>
          <span class="text-brand-500 font-mono text-xs">→</span>
        </button>
      </li>
    </ul>
    <p v-if="ranked.length === 0" class="text-ink-400 mt-2 text-sm">No open findings to rank.</p>
  </section>
</template>
