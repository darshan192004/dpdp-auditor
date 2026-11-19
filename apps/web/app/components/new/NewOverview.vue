<script setup lang="ts">
import { computed } from 'vue';

import { coverageFor, type ScanCounts, type ScanDetail, type ScanCoverage } from '~~/shared/scan';
import type { FindingView } from '~~/shared/findings';
import DashboardPageHeader from '~/components/dashboard/DashboardPageHeader.vue';
import FixFirstList from '~/components/dashboard/FixFirstList.vue';
import ScoreRing from '~/components/dashboard/ScoreRing.vue';
import SectionCoverageGrid from '~/components/dashboard/SectionCoverageGrid.vue';
import SeverityBar from '~/components/dashboard/SeverityBar.vue';
import ScanTable from '~/components/dashboard/ScanTable.vue';
import TrendSparkline from '~/components/dashboard/TrendSparkline.vue';

const props = defineProps<{
  stats: { label: string; value: string | number }[];
  latestScan:
    | (Pick<ScanDetail, 'id' | 'status' | 'score' | 'grade' | 'coverage' | 'repository'> &
        Partial<ScanDetail>)
    | null;
  counts: ScanCounts;
  sections: {
    code: string;
    title: string;
    state: 'ready' | 'partial' | 'at_risk';
    controls: number;
  }[];
  findings: FindingView[];
  health: string;
  recentScans?: import('~~/shared/scan').ScanSummary[];
  trend?: number[];
}>();

const coverage = computed(() => coverageFor((props.latestScan?.coverage ?? {}) as ScanCoverage));
</script>

<template>
  <div class="min-w-0">
    <DashboardPageHeader
      title="Overview"
      subtitle="DPDP posture drawn from real repository evidence."
    >
      <template #actions>
        <NuxtLink
          to="/app/scans?new=1"
          class="bg-brand-500 text-ink-50 rounded-[var(--radius-control)] px-4 py-2 text-sm"
        >
          + New scan
        </NuxtLink>
      </template>
    </DashboardPageHeader>

    <div class="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section class="bg-surface rounded-[var(--radius-card)] p-5 shadow-[var(--shadow-card)]">
        <ScoreRing
          v-if="latestScan"
          :score="latestScan.score"
          :grade="latestScan.grade"
          :coverage="coverage"
        />
        <p v-else class="text-ink-400 text-sm">
          No completed scan yet — start one to see your score.
        </p>
        <TrendSparkline v-if="trend" :values="trend" class="mt-5" />
      </section>
      <section class="bg-surface rounded-[var(--radius-card)] p-5 shadow-[var(--shadow-card)]">
        <p class="text-ink-400 font-mono text-xs tracking-widest uppercase">Scanner health</p>
        <p class="mt-2 text-lg font-semibold">{{ health }}</p>
        <dl class="mt-4 grid grid-cols-2 gap-3">
          <div v-for="stat in stats" :key="stat.label">
            <dt class="text-ink-400 text-xs">{{ stat.label }}</dt>
            <dd class="text-lg font-medium tabular-nums">{{ stat.value }}</dd>
          </div>
        </dl>
      </section>
    </div>

    <div class="mt-6 grid gap-6 xl:grid-cols-2">
      <SectionCoverageGrid :sections="sections" />
      <div class="bg-surface rounded-[var(--radius-card)] p-5 shadow-[var(--shadow-card)]">
        <h2 class="text-ink-400 mb-3 font-mono text-xs tracking-widest uppercase">
          Finding severity
        </h2>
        <SeverityBar :counts="counts" />
      </div>
    </div>

    <div class="mt-6 grid gap-6 xl:grid-cols-2">
      <FixFirstList :findings="findings" :limit="5" />
      <div v-if="recentScans?.length" class="min-w-0">
        <ScanTable
          :scans="recentScans"
          :pagination="{ page: 1, pageSize: 5, totalItems: recentScans.length, totalPages: 1 }"
          status=""
        />
      </div>
    </div>
  </div>
</template>
