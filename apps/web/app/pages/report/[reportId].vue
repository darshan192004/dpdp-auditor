<script setup lang="ts">
/**
 * P5-22: accessible HTML report preview (docs/api.md 10.6). Same view model
 * the PDF renderer consumes, so the numbers on screen equal the numbers in
 * the PDF. Print layout gives it A4 geometry with no app chrome.
 */
import { computed } from 'vue';

import DsSkeleton from '~/components/ds/DsSkeleton.vue';
import NewReport from '~/components/new/NewReport.vue';

definePageMeta({ layout: 'print' });

interface ReportViewModel {
  report: { id: string; format: string; templateVersion: string; createdAt: string };
  organization: { name: string; slug: string; dataRegion: string };
  scan: {
    id: string;
    repository: { fullName: string; visibility: string };
    ref: string;
    commitSha: string | null;
    status: string;
    score: number | null;
    grade: string | null;
    sectionScores: Record<string, number | null>;
    counts: {
      critical: number;
      high: number;
      medium: number;
      low: number;
      info: number;
      total: number;
    };
    coverage: Record<string, string>;
    rulePackVersion: string | null;
    scoringVersion: string | null;
    timestamps: {
      queuedAt: string;
      startedAt: string | null;
      completedAt: string | null;
      durationMs: number | null;
    };
  };
  topFindings: Array<{
    id: string;
    title: string;
    severity: string;
    scanner: string;
    section: string | null;
    status: string;
  }>;
  methodology: { scoringVersion: string | null; rulePackVersion: string | null; summary: string };
  disclaimer: string;
  generatedAt: string;
}

const route = useRoute();
const reportId = computed(() => String(route.params.reportId));

const { data, status } = await useFetch<{ data: ReportViewModel }>(
  () => `/api/v1/report/pdf/${reportId.value}/view`,
);

const report = computed(() => data.value?.data ?? null);
const loading = computed(() => status.value === 'pending');
</script>

<template>
  <DsSkeleton v-if="loading" class="h-32" />
  <NewReport
    v-else
    :scan-id="report?.scan.id ?? ''"
    :can-export="report?.scan.status === 'completed'"
  />
</template>
