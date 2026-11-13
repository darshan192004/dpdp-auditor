<script setup lang="ts">
import { computed } from 'vue';

import type { FindingScanner } from '~~/shared/findings';
import type { RuleSectionOption } from '~~/shared/rules';
import { rulesUrl } from '~~/shared/rules';

const props = defineProps<{
  sections: RuleSectionOption[];
  active: string | null;
  scanner: FindingScanner | null;
}>();

const total = computed(() => props.sections.reduce((sum, option) => sum + option.count, 0));

const allTo = computed(() => rulesUrl({ section: null, scanner: props.scanner }));
</script>

<template>
  <nav aria-label="Control sections">
    <p class="text-ink-500 mb-2 px-2 text-xs font-medium tracking-wide uppercase">Sections</p>
    <ul class="flex flex-wrap gap-1 lg:block lg:space-y-0.5">
      <li>
        <NuxtLink
          :to="allTo"
          :aria-current="active === null ? 'page' : undefined"
          class="focus-visible:ring-brand-500 flex items-center justify-between gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
          :class="
            active === null
              ? 'bg-brand-50 text-brand-900 font-medium'
              : 'text-ink-700 hover:bg-ink-50'
          "
        >
          <span>All controls</span>
          <span class="text-ink-500 text-xs tabular-nums">{{ total }}</span>
        </NuxtLink>
      </li>
      <li v-for="option in sections" :key="option.section">
        <NuxtLink
          :to="rulesUrl({ section: option.section, scanner })"
          :aria-current="active === option.section ? 'page' : undefined"
          class="focus-visible:ring-brand-500 flex items-center justify-between gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
          :class="
            active === option.section
              ? 'bg-brand-50 text-brand-900 font-medium'
              : 'text-ink-700 hover:bg-ink-50'
          "
        >
          <span class="flex min-w-0 items-baseline gap-2">
            <span class="text-ink-400 w-8 shrink-0 font-mono text-xs tabular-nums">
              {{ option.section }}
            </span>
            <span class="truncate">{{ option.label }}</span>
          </span>
          <span class="text-ink-500 text-xs tabular-nums">{{ option.count }}</span>
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
