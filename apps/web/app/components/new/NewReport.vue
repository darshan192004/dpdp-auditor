<script setup lang="ts">
/**
 * P5-22: accessible HTML report preview (docs/api.md §10.6). The view model is
 * the same one the PDF renderer consumes, so the numbers on screen match the
 * downloaded file. Print layout gives it A4 geometry with no app chrome.
 */
import { computed } from 'vue';

import DsCard from '~/components/ds/DsCard.vue';
import DsEmptyState from '~/components/ds/DsEmptyState.vue';

interface ReportView {
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

const props = withDefaults(
  defineProps<{ report: ReportView | null; error?: string | null; loading?: boolean }>(),
  { error: null, loading: false },
);

const scan = computed(() => props.report?.scan ?? null);
const counts = computed(() => scan.value?.counts ?? null);
const sections = computed(() =>
  Object.entries(scan.value?.sectionScores ?? {}).sort((a, b) => (a[1] ?? 0) - (b[1] ?? 0)),
);
const score = computed(() =>
  scan.value?.score === null || scan.value?.score === undefined ? '—' : scan.value.score.toFixed(1),
);
const generated = computed(() =>
  props.report
    ? new Date(props.report.generatedAt).toLocaleString('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      }) + ' UTC'
    : '',
);

function printReport(): void {
  if (typeof window !== 'undefined') window.print();
}
</script>

<template>
  <div>
    <DsSkeleton v-if="loading" class="mt-6 h-64" />
    <template v-else-if="error || report === null || scan === null || counts === null">
      <DsEmptyState
        :title="error ?? 'Report unavailable'"
        :message="error ? 'Return to the scan and request a new export.' : ''"
        class="mt-6"
      />
      <NuxtLink
        to="/app/scans"
        class="text-brand-600 mt-4 inline-block text-sm underline focus-visible:outline-2"
      >
        Back to scans
      </NuxtLink>
    </template>
    <template v-else>
      <div class="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <NuxtLink to="/app/scans" class="text-ink-600 text-sm underline">← Back to scans</NuxtLink>
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="border-ink-300 rounded-[var(--radius-control)] border px-3 py-1.5 text-sm"
            @click="printReport"
          >
            Print / Save as PDF
          </button>
          <a
            :href="`/api/v1/report/pdf/${report.report.id}/download`"
            class="bg-brand-500 text-ink-50 rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium"
          >
            Download PDF
          </a>
        </div>
      </div>

      <header>
        <p class="text-ink-400 font-mono text-xs uppercase">DPDPA compliance report</p>
        <h1 class="mt-1 text-3xl font-semibold">{{ scan.repository.fullName }}</h1>
        <p class="text-ink-500 mt-2 text-sm">
          {{ report.organization.name }} · {{ scan.ref }} ·
          {{ scan.commitSha?.slice(0, 7) ?? 'no commit' }} · generated {{ generated }}
        </p>
      </header>

      <DsCard class="mt-6">
        <div class="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p class="text-ink-400 font-mono text-xs uppercase">DPDP score</p>
            <p class="mt-1 text-5xl font-semibold">
              {{ score }}<span class="text-ink-400 text-lg"> / 100</span>
            </p>
            <p class="text-ink-600 mt-1 text-sm">
              Grade {{ scan.grade ?? '—' }} · {{ report.report.templateVersion }} template
            </p>
          </div>
          <dl class="grid grid-cols-5 gap-x-5 gap-y-1 text-center text-sm">
            <div
              v-for="item in [
                ['Critical', counts.critical],
                ['High', counts.high],
                ['Medium', counts.medium],
                ['Low', counts.low],
                ['Info', counts.info],
              ]"
              :key="item[0]"
            >
              <dt class="text-ink-400 text-xs uppercase">{{ item[0] }}</dt>
              <dd class="mt-0.5 font-mono text-lg">{{ item[1] }}</dd>
            </div>
          </dl>
        </div>
      </DsCard>

      <section class="mt-8">
        <h2 class="text-lg font-semibold">Section readiness</h2>
        <table class="border-ink-200 mt-3 w-full border-collapse text-left text-sm">
          <thead>
            <tr class="bg-ink-100 text-ink-500 font-mono text-xs uppercase">
              <th class="px-3 py-2">Section</th>
              <th class="px-3 py-2">Score</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="[section, value] in sections" :key="section" class="border-ink-200 border-t">
              <td class="px-3 py-2">{{ section }}</td>
              <td class="px-3 py-2 font-mono">{{ value === null ? '—' : value.toFixed(1) }}</td>
            </tr>
            <tr v-if="sections.length === 0">
              <td colspan="2" class="text-ink-400 px-3 py-2">No scored sections for this scan.</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="mt-8">
        <h2 class="text-lg font-semibold">Priority findings ({{ scan.counts.total }} total)</h2>
        <table class="border-ink-200 mt-3 w-full border-collapse text-left text-sm">
          <thead>
            <tr class="bg-ink-100 text-ink-500 font-mono text-xs uppercase">
              <th class="px-3 py-2">Severity</th>
              <th class="px-3 py-2">Control</th>
              <th class="px-3 py-2">Finding</th>
              <th class="px-3 py-2">Scanner</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="finding in report.topFindings"
              :key="finding.id"
              class="border-ink-200 border-t align-top"
            >
              <td class="px-3 py-2 font-mono">{{ finding.severity }}</td>
              <td class="px-3 py-2">{{ finding.section ?? 'Unmapped' }}</td>
              <td class="px-3 py-2">{{ finding.message }}</td>
              <td class="px-3 py-2">{{ finding.scanner }}</td>
            </tr>
            <tr v-if="report.topFindings.length === 0">
              <td colspan="4" class="text-ink-400 px-3 py-2">No findings were recorded.</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="mt-8">
        <h2 class="text-lg font-semibold">Methodology</h2>
        <p class="text-ink-600 mt-2 text-sm">{{ report.methodology.summary }}</p>
        <p class="text-ink-400 mt-1 font-mono text-xs">
          Scoring {{ report.methodology.scoringVersion ?? '—' }} · Rule pack
          {{ report.methodology.rulePackVersion ?? '—' }} · Scanners
          {{
            Object.entries(scan.coverage)
              .map(([name, status]) => `${name}: ${status}`)
              .join(', ')
          }}
        </p>
      </section>

      <footer class="border-ink-200 text-ink-500 mt-10 border-t pt-4 text-xs">
        {{ report.disclaimer }}
      </footer>
    </template>
  </div>
</template>
