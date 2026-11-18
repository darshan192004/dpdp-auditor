<script setup lang="ts">
/**
 * P5-22: accessible HTML report preview (docs/api.md 10.6). Same view model
 * the PDF renderer consumes, so the numbers on screen equal the numbers in
 * the PDF. Print layout gives it A4 geometry with no app chrome.
 */
import { computed } from 'vue';

import { SCAN_STATUS_LABELS, formatScore, formatTimestamp, scanSections } from '~~/shared/scan';

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

const { data, status, error } = await useFetch<{ data: ReportViewModel }>(
  () => `/api/v1/report/pdf/${reportId.value}/view`,
);

const report = computed(() => data.value?.data ?? null);
const sections = computed(() =>
  report.value === null ? [] : scanSections(report.value.scan.sectionScores),
);
const loading = computed(() => status.value === 'pending');
// Nuxt serialises a successful fetch with no error key, so the value is
// undefined rather than null - a strict !== null would always be true.
const failed = computed(() => error.value != null);
const loadError = computed(() => {
  const failure = error.value as { data?: { error?: { message?: string } } } | null;
  return failure?.data?.error?.message ?? 'The report could not be loaded.';
});

const severityCounts = computed(() => {
  const counts = report.value?.scan.counts;
  if (!counts) return [];
  return [
    { key: 'critical', label: 'Critical', value: counts.critical },
    { key: 'high', label: 'High', value: counts.high },
    { key: 'medium', label: 'Medium', value: counts.medium },
    { key: 'low', label: 'Low', value: counts.low },
    { key: 'info', label: 'Info', value: counts.info },
  ];
});

function shortSha(sha: string | null): string {
  return sha === null ? '-' : sha.slice(0, 7);
}

function duration(ms: number | null): string {
  if (ms === null) return '-';
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
</script>

<template>
  <article class="text-ink-900 space-y-8 text-sm">
    <header class="border-ink-200 border-b pb-5">
      <p class="text-ink-400 font-mono text-xs tracking-widest uppercase">DPDPA audit report</p>
      <h1 class="mt-2 text-2xl font-semibold">
        {{ report?.scan.repository.fullName ?? 'Loading report' }}
      </h1>
      <p class="text-ink-600 mt-1">
        {{ report?.organization.name ?? '' }}
        <span v-if="report"> &middot; generated {{ formatTimestamp(report.generatedAt) }}</span>
      </p>
    </header>

    <p v-if="loading" role="status" class="text-ink-500">Loading report.</p>

    <p v-else-if="failed" role="alert" class="text-risk-critical-text">{{ loadError }}</p>

    <template v-else-if="report !== null">
      <section aria-labelledby="summary-heading" class="space-y-3">
        <h2 id="summary-heading" class="text-ink-900 text-lg font-semibold">Executive summary</h2>
        <div class="flex flex-wrap items-baseline gap-6">
          <div>
            <span class="text-ink-400 font-mono text-xs tracking-widest uppercase">Score</span>
            <p class="text-3xl font-semibold tabular-nums">{{ formatScore(report.scan.score) }}</p>
          </div>
          <div>
            <span class="text-ink-400 font-mono text-xs tracking-widest uppercase">Grade</span>
            <p class="text-3xl font-semibold">{{ report.scan.grade ?? 'withheld' }}</p>
          </div>
          <div>
            <span class="text-ink-400 font-mono text-xs tracking-widest uppercase">Findings</span>
            <p class="text-3xl font-semibold tabular-nums">{{ report.scan.counts.total }}</p>
          </div>
        </div>
        <dl class="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          <div>
            <dt class="text-ink-400 font-mono text-xs tracking-widest uppercase">Status</dt>
            <dd>
              {{
                SCAN_STATUS_LABELS[report.scan.status as keyof typeof SCAN_STATUS_LABELS] ??
                report.scan.status
              }}
            </dd>
          </div>
          <div>
            <dt class="text-ink-400 font-mono text-xs tracking-widest uppercase">Branch</dt>
            <dd class="font-mono text-xs">
              {{ report.scan.ref }} @ {{ shortSha(report.scan.commitSha) }}
            </dd>
          </div>
          <div>
            <dt class="text-ink-400 font-mono text-xs tracking-widest uppercase">Completed</dt>
            <dd class="tabular-nums">{{ formatTimestamp(report.scan.timestamps.completedAt) }}</dd>
          </div>
          <div>
            <dt class="text-ink-400 font-mono text-xs tracking-widest uppercase">Duration</dt>
            <dd class="tabular-nums">{{ duration(report.scan.timestamps.durationMs) }}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="severity-heading" class="space-y-3">
        <h2 id="severity-heading" class="text-ink-900 text-lg font-semibold">
          Findings by severity
        </h2>
        <table class="w-full text-left">
          <caption class="sr-only">
            Finding counts by severity
          </caption>
          <thead
            class="text-ink-400 border-ink-200 border-b font-mono text-xs tracking-widest uppercase"
          >
            <tr>
              <th scope="col" class="py-2 pr-4 font-medium">Severity</th>
              <th scope="col" class="py-2 pr-4 text-right font-medium">Count</th>
            </tr>
          </thead>
          <tbody class="divide-ink-200 divide-y">
            <tr v-for="row in severityCounts" :key="row.key">
              <td class="py-2 pr-4 capitalize">{{ row.label }}</td>
              <td class="py-2 pr-4 text-right tabular-nums">{{ row.value }}</td>
            </tr>
            <tr class="font-semibold">
              <td class="py-2 pr-4">Total</td>
              <td class="py-2 pr-4 text-right tabular-nums">{{ report.scan.counts.total }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section aria-labelledby="sections-heading" class="space-y-3">
        <h2 id="sections-heading" class="text-ink-900 text-lg font-semibold">Score breakdown</h2>
        <table class="w-full text-left">
          <caption class="sr-only">
            Section scores, worst first
          </caption>
          <thead
            class="text-ink-400 border-ink-200 border-b font-mono text-xs tracking-widest uppercase"
          >
            <tr>
              <th scope="col" class="py-2 pr-4 font-medium">Section</th>
              <th scope="col" class="py-2 pr-4 text-right font-medium">Score</th>
            </tr>
          </thead>
          <tbody class="divide-ink-200 divide-y">
            <tr v-for="row in sections" :key="row.section">
              <td class="py-2 pr-4">
                <span class="text-ink-400 font-mono text-xs">{{ row.section }}</span>
                {{ row.label }}
              </td>
              <td class="py-2 pr-4 text-right tabular-nums">
                {{ row.score === null ? 'not assessed' : formatScore(row.score) }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section aria-labelledby="findings-heading" class="space-y-3">
        <h2 id="findings-heading" class="text-ink-900 text-lg font-semibold">Top findings</h2>
        <p v-if="report.topFindings.length === 0" class="text-ink-500">
          No open findings were recorded for this scan.
        </p>
        <table v-else class="w-full text-left">
          <caption class="sr-only">
            Top findings with severity and status
          </caption>
          <thead
            class="text-ink-400 border-ink-200 border-b font-mono text-xs tracking-widest uppercase"
          >
            <tr>
              <th scope="col" class="py-2 pr-4 font-medium">Finding</th>
              <th scope="col" class="py-2 pr-4 font-medium">Severity</th>
              <th scope="col" class="py-2 pr-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody class="divide-ink-200 divide-y">
            <tr v-for="finding in report.topFindings" :key="finding.id">
              <td class="py-2 pr-4">{{ finding.message }}</td>
              <td class="py-2 pr-4 capitalize">{{ finding.severity }}</td>
              <td class="py-2 pr-4 capitalize">{{ finding.status }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section aria-labelledby="methodology-heading" class="space-y-2">
        <h2 id="methodology-heading" class="text-ink-900 text-lg font-semibold">Methodology</h2>
        <p class="text-ink-700">{{ report.methodology.summary }}</p>
        <p class="text-ink-500 font-mono text-xs">
          Rule pack {{ report.methodology.rulePackVersion ?? '-' }} &middot; scoring
          {{ report.methodology.scoringVersion ?? '-' }} &middot; template
          {{ report.report.templateVersion }}
        </p>
      </section>

      <footer class="border-ink-200 border-t pt-4">
        <p class="text-ink-500 text-xs">{{ report.disclaimer }}</p>
      </footer>
    </template>
  </article>
</template>
