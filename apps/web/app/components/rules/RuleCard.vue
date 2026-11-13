<script setup lang="ts">
import { computed } from 'vue';

import type { RuleView } from '~~/shared/rules';
import { ruleSectionLabel, ruleWeightLabel } from '~~/shared/rules';
import SeverityBadge from '../findings/SeverityBadge.vue';
import ScannerLabel from '../findings/ScannerLabel.vue';
import AppIcon from '../ui/AppIcon.vue';

const props = defineProps<{ rule: RuleView }>();

const scanners = computed(() => [
  ...new Set(props.rule.mappings.map((mapping) => mapping.scanner)),
]);
const mappingLabel = computed(() => {
  const count = props.rule.mappings.length;
  return `${count} ${count === 1 ? 'scanner rule' : 'scanner rules'}`;
});
</script>

<template>
  <NuxtLink
    :to="`/app/rules/${rule.code}`"
    class="focus-visible:ring-brand-500 border-ink-200 hover:border-ink-300 hover:bg-ink-50/40 block rounded-[var(--radius-card)] border bg-white px-4 py-3 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
  >
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span class="text-ink-500 font-mono text-xs">{{ rule.code }}</span>
      <span class="text-ink-300" aria-hidden="true">/</span>
      <span class="text-ink-500 text-xs">{{ ruleSectionLabel(rule.section) }}</span>
      <span class="ml-auto flex flex-wrap items-center gap-1.5">
        <SeverityBadge :severity="rule.severity" />
        <span
          class="border-ink-200 text-ink-600 rounded-[var(--radius-pill)] border px-2 py-0.5 text-xs tabular-nums"
        >
          {{ ruleWeightLabel(rule) }}
        </span>
      </span>
    </div>

    <h2 class="text-ink-900 mt-1.5 text-sm font-semibold">{{ rule.title }}</h2>
    <p class="text-ink-600 mt-1 line-clamp-2 text-sm">{{ rule.summary }}</p>

    <div class="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
      <span class="text-ink-500 inline-flex items-center gap-1.5 text-xs">
        <AppIcon name="target" :size="13" class="text-ink-400" />
        {{ mappingLabel }}
      </span>
      <ScannerLabel v-for="scanner in scanners" :key="scanner" :scanner="scanner" />
      <span class="text-ink-400 ml-auto inline-flex items-center gap-1 text-xs">
        Open control
        <AppIcon name="chevron-right" :size="13" />
      </span>
    </div>
  </NuxtLink>
</template>
