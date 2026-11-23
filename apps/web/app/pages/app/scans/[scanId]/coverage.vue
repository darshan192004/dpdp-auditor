<script setup lang="ts">
import ScoreCoverageDrilldown from '~/components/new/ScoreCoverageDrilldown.vue';
import type { FindingsPage, FindingView } from '~~/shared/findings';
import { coverageFor, scanSections, SECTION_LABELS, type ScanDetail } from '~~/shared/scan';

const route = useRoute();
const scanId = computed(() => String(route.params.scanId));
const { data: scanData } = await useFetch<{ data: ScanDetail }>(
  () => `/api/v1/scan/${scanId.value}`,
);
const { data: findingsData } = await useFetch<FindingsPage>(
  () => `/api/v1/scan/${scanId.value}/findings?page=1&pageSize=100`,
);

const scan = computed(() => scanData.value?.data ?? null);
const assessment = computed(() =>
  scan.value === null ? { state: 'partial', note: null } : coverageFor(scan.value.coverage),
);
const sections = computed(() =>
  scan.value === null
    ? []
    : scanSections(scan.value.sectionScores).map((row) => ({
        code: row.section,
        title: SECTION_LABELS[row.section] ?? row.section,
        score: row.score,
      })),
);
const findings = computed(() =>
  (findingsData.value?.data ?? []).map((finding: FindingView) => ({
    id: finding.id,
    severity: finding.severity,
    message: finding.message,
  })),
);
</script>

<template>
  <ScoreCoverageDrilldown
    :score="scan?.score ?? null"
    :grade="scan?.grade ?? null"
    :coverage="assessment.state"
    :coverage-note="assessment.note"
    :sections="sections"
    :findings="findings"
  />
</template>
