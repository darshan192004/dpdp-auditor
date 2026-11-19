<script setup lang="ts">
import { computed, ref } from 'vue';

import DashboardPageHeader from '~/components/dashboard/DashboardPageHeader.vue';
import ScoreRing from '~/components/dashboard/ScoreRing.vue';
import SeverityBar from '~/components/dashboard/SeverityBar.vue';
import StatusChip from '~/components/dashboard/StatusChip.vue';
import DsSkeleton from '~/components/ds/DsSkeleton.vue';
import CoverageBanner from '~/components/scan/CoverageBanner.vue';
import ScanProgress from '~/components/scan/ScanProgress.vue';
import ScoreCard from '~/components/scan/ScoreCard.vue';
import SectionBreakdown from '~/components/scan/SectionBreakdown.vue';
import {
  coverageFor,
  isTerminalStatus,
  scanSections,
  type ScanDetail as ScanDetailView,
} from '~~/shared/scan';

const props = withDefaults(defineProps<{ scan: ScanDetailView | null; loading?: boolean }>(), {
  loading: false,
});
const emit = defineEmits<{ cancel: [reason: string] }>();

const CANCEL_REASON = 'Cancelled from the console';

const confirming = ref(false);
const coverage = computed(() => coverageFor(props.scan?.coverage ?? {}));
const running = computed(() => props.scan !== null && !isTerminalStatus(props.scan.status));
const sections = computed(() =>
  props.scan === null ? [] : scanSections(props.scan.sectionScores),
);

function confirmCancel(): void {
  emit('cancel', CANCEL_REASON);
  confirming.value = false;
}
</script>

<template>
  <div class="min-w-0">
    <DsSkeleton v-if="loading || scan === null" class="mt-6 h-64" />
    <template v-else>
      <DashboardPageHeader
        :title="scan.repository.fullName"
        subtitle="Scan detail and evidence trail."
      >
        <template #actions>
          <StatusChip :status="scan.status" />
          <NuxtLink
            :to="`/app/scans/${scan.id}/findings`"
            class="border-ink-300 rounded-[var(--radius-control)] border px-3 py-1.5 text-sm"
          >
            Findings
          </NuxtLink>
          <NuxtLink
            :to="`/app/scans/${scan.id}/coverage`"
            class="border-ink-300 rounded-[var(--radius-control)] border px-3 py-1.5 text-sm"
          >
            Coverage
          </NuxtLink>
          <NuxtLink
            :to="`/report/${scan.id}`"
            class="border-ink-300 rounded-[var(--radius-control)] border px-3 py-1.5 text-sm"
          >
            Report
          </NuxtLink>
          <button
            v-if="running && !confirming"
            type="button"
            data-action="request-cancel"
            class="border-risk-critical-border text-risk-critical-text rounded-[var(--radius-control)] border px-3 py-1.5 text-sm"
            @click="confirming = true"
          >
            Cancel scan
          </button>
        </template>
      </DashboardPageHeader>

      <div
        v-show="running && confirming"
        role="alertdialog"
        aria-label="Confirm cancellation"
        class="bg-surface border-risk-critical-border mb-4 rounded-[var(--radius-card)] border p-4"
      >
        <p class="text-sm">Cancel this scan? Partial results are kept.</p>
        <div class="mt-3 flex gap-2">
          <button
            type="button"
            data-action="cancel"
            class="bg-risk-critical-solid text-ink-50 rounded-[var(--radius-control)] px-3 py-1.5 text-sm"
            @click="confirmCancel"
          >
            Confirm cancel
          </button>
          <button
            type="button"
            class="border-ink-300 rounded-[var(--radius-control)] border px-3 py-1.5 text-sm"
            @click="confirming = false"
          >
            Keep running
          </button>
        </div>
      </div>

      <section
        class="bg-surface grid gap-5 rounded-[var(--radius-card)] p-5 shadow-[var(--shadow-card)] lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
      >
        <ScoreRing :score="scan.score" :grade="scan.grade" :coverage="coverage" />
        <div>
          <CoverageBanner v-if="coverage.note" :note="coverage.note" />
          <ScoreCard
            v-else
            :scan-id="scan.id"
            :score="scan.score"
            :grade="scan.grade"
            :previous-score="scan.previousScore"
            :coverage="coverage.state"
            :coverage-note="coverage.note"
            :counts="scan.counts"
          />
          <SeverityBar :counts="scan.counts" class="mt-5" />
        </div>
      </section>

      <ScanProgress
        v-if="running"
        :scan-id="scan.id"
        :status="scan.status"
        :coverage="scan.coverage"
        :timestamps="scan.timestamps"
        :can-cancel="false"
      />

      <SectionBreakdown :scan-id="scan.id" :rows="sections" class="mt-6" />
    </template>
  </div>
</template>
