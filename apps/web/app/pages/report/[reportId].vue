<script setup lang="ts">
/**
 * P5-22: accessible HTML report preview (docs/api.md 10.6). Same view model
 * the PDF renderer consumes, so the numbers on screen equal the numbers in
 * the PDF. Print layout gives it A4 geometry with no app chrome.
 */
import { computed } from 'vue';

import DsSkeleton from '~/components/ds/DsSkeleton.vue';

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
    message: string;
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

const severityClass = (s: string) => {
  switch (s) {
    case 'critical':
      return 'bg-risk-critical-bg text-risk-critical-text border border-risk-critical-border';
    case 'high':
      return 'bg-risk-high-bg text-risk-high-text border border-risk-high-border';
    case 'medium':
      return 'bg-risk-medium-bg text-risk-medium-text border border-risk-medium-border';
    case 'low':
      return 'bg-risk-low-bg text-risk-low-text border border-risk-low-border';
    default:
      return 'bg-ink-100 text-ink-700 border border-ink-200';
  }
};
</script>

<template>
  <DsSkeleton v-if="loading" class="h-32" />
  <article v-else-if="report" class="report-preview">
    <header class="mb-8">
      <h1 class="text-3xl font-semibold">
        {{ report.scan.repository.fullName }} — DPDPA Audit Report
      </h1>
      <dl class="text-ink-500 mt-4 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt class="font-medium">Scan</dt>
          <dd>{{ report.scan.id }}</dd>
        </div>
        <div>
          <dt class="font-medium">Branch</dt>
          <dd>{{ report.scan.ref }}</dd>
        </div>
        <div>
          <dt class="font-medium">Commit</dt>
          <dd class="font-mono">{{ report.scan.commitSha?.slice(0, 8) ?? '—' }}</dd>
        </div>
        <div>
          <dt class="font-medium">Score</dt>
          <dd>{{ report.scan.score ?? '—' }} (Grade {{ report.scan.grade ?? '—' }})</dd>
        </div>
        <div>
          <dt class="font-medium">Generated</dt>
          <dd>{{ new Date(report.generatedAt).toLocaleString() }}</dd>
        </div>
        <div>
          <dt class="font-medium">Organization</dt>
          <dd>{{ report.organization.name }}</dd>
        </div>
      </dl>
    </header>

    <section class="mb-8" aria-labelledby="score-heading">
      <h2 id="score-heading" class="mb-4 text-xl font-semibold">Compliance Score</h2>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div class="bg-surface-raised rounded-lg p-4">
          <p class="text-ink-900 text-3xl font-bold">{{ report.scan.score ?? '—' }}</p>
          <p class="text-ink-500 text-sm">Overall Score</p>
        </div>
        <div class="bg-surface-raised rounded-lg p-4">
          <p class="text-ink-900 text-3xl font-bold">{{ report.scan.grade ?? '—' }}</p>
          <p class="text-ink-500 text-sm">Grade</p>
        </div>
        <div class="bg-surface-raised rounded-lg p-4">
          <p class="text-ink-900 text-3xl font-bold">{{ report.scan.counts.total }}</p>
          <p class="text-ink-500 text-sm">Total Findings</p>
        </div>
      </div>
    </section>

    <section class="mb-8" aria-labelledby="section-scores-heading">
      <h2 id="section-scores-heading" class="mb-4 text-xl font-semibold">Section Scores</h2>
      <table class="w-full text-sm">
        <thead>
          <tr class="text-ink-500 border-ink-200 border-b text-left">
            <th class="pb-2">Section</th>
            <th class="pb-2 text-right">Score</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="[section, score] in Object.entries(report.scan.sectionScores)"
            :key="section"
            class="border-ink-100 border-b"
          >
            <td class="py-2 font-medium">{{ section }}</td>
            <td class="py-2 text-right">{{ score ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="mb-8" aria-labelledby="findings-heading">
      <h2 id="findings-heading" class="mb-4 text-xl font-semibold">Top Findings</h2>
      <div v-if="report.topFindings.length === 0" class="text-ink-500">No findings.</div>
      <table v-else class="w-full text-sm">
        <thead>
          <tr class="text-ink-500 border-ink-200 border-b text-left">
            <th class="pb-2">Severity</th>
            <th class="pb-2">Message</th>
            <th class="pb-2">Scanner</th>
            <th class="pb-2">Section</th>
            <th class="pb-2">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in report.topFindings" :key="f.id" class="border-ink-100 border-b">
            <td class="py-2">
              <span
                class="rounded px-2 py-0.5 text-xs font-medium"
                :class="severityClass(f.severity)"
                >{{ f.severity }}</span
              >
            </td>
            <td class="py-2">{{ f.message }}</td>
            <td class="py-2 font-mono text-xs">{{ f.scanner }}</td>
            <td class="py-2">{{ f.section ?? '—' }}</td>
            <td class="py-2">{{ f.status }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="mb-8" aria-labelledby="methodology-heading">
      <h2 id="methodology-heading" class="mb-4 text-xl font-semibold">Methodology</h2>
      <p class="text-ink-600">{{ report.methodology.summary }}</p>
      <dl class="text-ink-500 mt-4 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt class="font-medium">Rule Pack</dt>
          <dd>{{ report.methodology.rulePackVersion ?? '—' }}</dd>
        </div>
        <div>
          <dt class="font-medium">Scoring</dt>
          <dd>{{ report.methodology.scoringVersion ?? '—' }}</dd>
        </div>
      </dl>
    </section>

    <section class="mb-8" aria-labelledby="disclaimer-heading">
      <h2 id="disclaimer-heading" class="mb-4 text-xl font-semibold">Disclaimer</h2>
      <p class="text-ink-600">{{ report.disclaimer }}</p>
    </section>

    <footer class="border-ink-200 text-ink-500 border-t pt-4 text-xs">
      Report generated on {{ new Date(report.generatedAt).toLocaleString() }} by DPDPA Auditor.
    </footer>
  </article>
  <p v-else class="text-ink-500">Report not found.</p>
</template>

<style scoped>
.report-preview {
  max-width: 210mm;
  margin: 0 auto;
  padding: 24mm;
  font-family: var(--font-sans);
}
</style>
