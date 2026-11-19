<script setup lang="ts">
import { computed } from 'vue';

import NewOverview from '~/components/new/NewOverview.vue';
import { ruleSections, type RuleSectionOption, type RulesPage } from '~~/shared/rules';

interface CatalogSummary {
  total: number;
  scored: number;
  sections: RuleSectionOption[];
  mappings: number;
}

/**
 * The overview only needs counts. Summarise the catalog on the server so the
 * hydration payload carries a few hundred bytes instead of the whole catalog.
 */
const { data } = await useAsyncData<CatalogSummary>('overview-catalog', async () => {
  const page = await $fetch<RulesPage>('/api/v1/rules');
  const controls = page.data;
  return {
    total: controls.length,
    scored: controls.filter((rule) => rule.scored).length,
    sections: ruleSections(controls),
    mappings: controls.reduce((sum, rule) => sum + rule.mappings.length, 0),
  };
});

const catalog = computed(() => data.value ?? null);
const KPIS = computed(() => [
  { label: 'Scored controls', value: catalog.value?.scored ?? 0 },
  {
    label: 'Not yet scored',
    value: (catalog.value?.total ?? 0) - (catalog.value?.scored ?? 0),
  },
  { label: 'Sections covered', value: catalog.value?.sections.length ?? 0 },
  { label: 'Scanner mappings', value: catalog.value?.mappings ?? 0 },
]);
</script>

<template>
  <NewOverview :stats="KPIS.map((item) => ({ ...item, value: String(item.value) }))" />
</template>
