<script setup lang="ts">
import { computed, ref } from 'vue';

import DashboardPageHeader from '~/components/dashboard/DashboardPageHeader.vue';
import DsEmptyState from '~/components/ds/DsEmptyState.vue';
import RuleCard from '~/components/rules/RuleCard.vue';
import SectionNav from '~/components/rules/SectionNav.vue';
import { ruleSections, type RuleView } from '~~/shared/rules';

const props = withDefaults(
  defineProps<{
    rules: RuleView[];
    section?: string | null;
    loading?: boolean;
    error?: string | null;
  }>(),
  { section: null, loading: false, error: null },
);

const query = ref('');
const sections = computed(() => ruleSections(props.rules));
const visible = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return props.rules.filter(
    (rule) =>
      (props.section === null || rule.section === props.section) &&
      (needle === '' || `${rule.code} ${rule.title}`.toLowerCase().includes(needle)),
  );
});
</script>

<template>
  <div class="min-w-0">
    <DashboardPageHeader title="Rules" subtitle="DPDP controls and their scanner mappings." />
    <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
      <SectionNav :sections="sections" :active="section" :scanner="null" />
      <div class="min-w-0">
        <label for="rule-search" class="text-ink-500 mb-1.5 block text-xs font-medium">
          Search controls
        </label>
        <input
          id="rule-search"
          v-model="query"
          data-rule-search
          type="search"
          aria-label="Search controls"
          placeholder="Search code or title"
          class="bg-surface-raised text-ink-900 border-ink-300 w-full rounded-[var(--radius-control)] px-3 py-2 text-sm"
        />
        <DsEmptyState
          v-if="!loading && !error && visible.length === 0"
          title="No rules found"
          class="mt-6"
        />
        <p v-else-if="loading" role="status" class="text-ink-400 mt-6 text-sm">Loading rules…</p>
        <p v-else-if="error" role="alert" class="text-risk-critical-text mt-6 text-sm">
          {{ error }}
        </p>
        <div v-else class="mt-4 grid gap-3 xl:grid-cols-2">
          <RuleCard v-for="rule in visible" :key="rule.code" :rule="rule" />
        </div>
      </div>
    </div>
  </div>
</template>
