<script setup lang="ts">
import { computed } from 'vue';

import NewOverview from '~/components/new/NewOverview.vue';
import { ruleSections, type RuleSectionOption, type RulesPage } from '~~/shared/rules';
import type { ScanDetail, ScanSummary, ScanListPage } from '~~/shared/scan';
import type { FindingsPage } from '~~/shared/findings';

// No `app` layout file exists: app.vue already wraps /app/** in NewAppShell
// unless a page opts into 'auth' | 'print' | 'default', so there is no meta to set.

interface CatalogSummary {
  total: number;
  scored: number;
  sections: RuleSectionOption[];
  mappings: number;
}

const catalogRequest = await useAsyncData<CatalogSummary>('overview-catalog', async () => {
  const page = await $fetch<RulesPage>('/api/v1/rules');
  const controls = page.data;
  return {
    total: controls.length,
    scored: controls.filter((rule) => rule.scored).length,
    sections: ruleSections(controls),
    mappings: controls.reduce((sum, rule) => sum + rule.mappings.length, 0),
  };
});

const latestRequest = await useAsyncData<ScanSummary | null>('overview-latest-scan', async () => {
  const page = await $fetch<{ data: ScanListPage }>('/api/v1/scans?status=completed&pageSize=1');
  return page.data.items[0] ?? null;
});

const scanId = computed(() => latestRequest.data.value?.id ?? '');
const detailRequest = await useAsyncData<ScanDetail | null>(
  'overview-scan-detail',
  () =>
    scanId.value
      ? $fetch<{ data: ScanDetail }>(`/api/v1/scan/${scanId.value}`).then((r) => r.data)
      : Promise.resolve(null),
  { watch: [scanId] },
);
const findingsRequest = await useAsyncData<FindingsPage['data']>(
  'overview-findings',
  () =>
    scanId.value
      ? $fetch<FindingsPage>(`/api/v1/scan/${scanId.value}/findings?pageSize=100`).then(
          (r) => r.data,
        )
      : Promise.resolve([]),
  { watch: [scanId] },
);
const healthRequest = await useAsyncData<string>('overview-health', async () => {
  try {
    const health = await $fetch<{ status: string }>('/api/health');
    return health.status;
  } catch {
    return 'unavailable';
  }
});

// FixFirstList ranks whatever it is given and its empty copy says "No open
// findings to rank", so hand it only the still-open findings.
const openFindings = computed(() =>
  (findingsRequest.data.value ?? []).filter((finding) => finding.status === 'open'),
);

const stats = computed(() => [
  { label: 'Scored controls', value: catalogRequest.data.value?.scored ?? 0 },
  { label: 'Sections covered', value: catalogRequest.data.value?.sections.length ?? 0 },
  { label: 'Scanner mappings', value: catalogRequest.data.value?.mappings ?? 0 },
  { label: 'Open findings', value: openFindings.value.length },
]);
const sections = computed(() =>
  (catalogRequest.data.value?.sections ?? []).map((section) => ({
    code: section.section,
    title: section.label,
    state: 'partial' as const,
    controls: section.count,
  })),
);
</script>

<template>
  <NewOverview
    :stats="stats"
    :latest-scan="detailRequest.data.value ?? null"
    :counts="
      detailRequest.data.value?.counts ?? {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
        total: 0,
      }
    "
    :sections="sections"
    :findings="openFindings"
    :health="healthRequest.data.value ?? 'unavailable'"
    :recent-scans="latestRequest.data.value ? [latestRequest.data.value] : []"
  />
</template>
