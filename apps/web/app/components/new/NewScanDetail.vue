<script setup lang="ts">
import { navigateTo } from '#app';
import { computed, ref } from 'vue';

import DashboardPageHeader from '~/components/dashboard/DashboardPageHeader.vue';
import { useToasts } from '~/composables/useToasts';
import ScoreRing from '~/components/dashboard/ScoreRing.vue';
import SeverityBar from '~/components/dashboard/SeverityBar.vue';
import StatusChip from '~/components/dashboard/StatusChip.vue';
import DsSkeleton from '~/components/ds/DsSkeleton.vue';
import CommandPalette from '~/components/motion/CommandPalette.vue';
import HoverCard from '~/components/motion/HoverCard.vue';
import MetricTile from '~/components/motion/MetricTile.vue';
import MotionTextReveal from '~/components/motion/MotionTextReveal.vue';
import ScrollReveal from '~/components/motion/ScrollReveal.vue';
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

const props = withDefaults(
  defineProps<{ scan: ScanDetailView | null; loading?: boolean; cancelling?: boolean }>(),
  {
    loading: false,
  },
);
const emit = defineEmits<{ cancel: [reason: string] }>();
const { push } = useToasts();

const CANCEL_REASON = 'Cancelled from the console';

const confirming = ref(false);
const openingReport = ref(false);
const coverage = computed(() => coverageFor(props.scan?.coverage ?? {}));
const running = computed(() => props.scan !== null && !isTerminalStatus(props.scan.status));
const sections = computed(() =>
  props.scan === null ? [] : scanSections(props.scan.sectionScores),
);
const paletteOpen = ref(false);
const legacy = computed(() => props.scan?.scoringVersion === '1.0.0');
const assessment = computed(() => props.scan?.assessment ?? null);
const gradeReason = computed(() => assessment.value?.gradeWithheldReason ?? null);
const gradeWithheld = computed(
  () => gradeReason.value === 'partial_coverage' || gradeReason.value === 'insufficient_evidence',
);
const gradeBanner = computed(() => {
  if (gradeReason.value === 'insufficient_evidence') return 'Insufficient evidence — no letter';
  if (gradeReason.value === 'partial_coverage') {
    return 'Partial coverage — no letter. Score provisional.';
  }
  return null;
});
const evidenceCoverage = computed(() => {
  const value = assessment.value?.evidenceCoverage;
  return value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`;
});
const openGaps = computed(() => assessment.value?.openGaps ?? 0);
// verdictCounts is authoritative for the tile count; the code list only
// drives the chips and may be empty when detectors recorded no control codes.
const unknownCount = computed(
  () => assessment.value?.verdictCounts.UNKNOWN ?? assessment.value?.unknownControls.length ?? 0,
);
const unknownCodes = computed(() => assessment.value?.unknownControls ?? []);
const unknownChips = computed(() =>
  unknownCodes.value.length > 0 ? unknownCodes.value : ['No control codes recorded'],
);
const consentCaption = computed(() => {
  const base = `${unknownCount.value} controls could not be determined`;
  return unknownCount.value > 0 && unknownCodes.value.length === 0
    ? `${base}; control codes not recorded in this scan`
    : base;
});
const consentGating = computed(() => {
  const ratio = assessment.value?.consentGatingRatio;
  return ratio === null || ratio === undefined
    ? 'Could not determine'
    : `${Math.round(ratio * 100)}%`;
});
const detectorNote = computed(() => {
  const statuses = assessment.value?.detectorStatuses;
  if (!statuses || Object.keys(statuses).length === 0) return null;
  const detail = Object.entries(statuses)
    .map(([detector, status]) => `${detector} ${status}`)
    .join(', ');
  return `Detector status: ${detail}.`;
});
const coverageBannerNote = computed(
  () =>
    coverage.value.note ?? (detectorNote.value ? 'Detector status recorded for this scan.' : null),
);

async function onPaletteNavigate(item: { href: string }): Promise<void> {
  await navigateTo(item.href);
}

function confirmCancel(): void {
  emit('cancel', CANCEL_REASON);
  confirming.value = false;
}

/** Report previews are read-only; reserve explicitly via POST (docs/api.md §6.1). */
async function openReport(): Promise<void> {
  if (openingReport.value || props.scan === null) return;
  openingReport.value = true;
  try {
    const response = await $fetch<{ data: { id: string } }>('/api/v1/report/pdf', {
      method: 'POST',
      body: { scanId: props.scan.id },
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    });
    await navigateTo(`/report/${response.data.id}`);
  } catch {
    push('error', 'Report unavailable', 'The report could not be opened. Please try again.');
  } finally {
    openingReport.value = false;
  }
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
          <button
            type="button"
            class="border-ink-300 focus-visible:ring-brand-500 cursor-pointer rounded-[var(--radius-control)] border px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
            data-action="open-command-palette"
            aria-haspopup="dialog"
            @click="paletteOpen = true"
          >
            Quick actions
          </button>
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
            :to="`/app/scans/${scan.id}/remediation`"
            class="border-ink-300 rounded-[var(--radius-control)] border px-3 py-1.5 text-sm"
          >
            Remediation
          </NuxtLink>
          <button
            type="button"
            class="border-ink-300 cursor-pointer rounded-[var(--radius-control)] border px-3 py-1.5 text-sm"
            :disabled="openingReport"
            @click="openReport"
          >
            {{ openingReport ? 'Opening…' : 'Report' }}
          </button>
          <button
            v-if="running && !confirming"
            type="button"
            :disabled="cancelling"
            data-action="request-cancel"
            class="border-risk-critical-border text-risk-critical-text rounded-[var(--radius-control)] border px-3 py-1.5 text-sm"
            @click="confirming = true"
          >
            Cancel scan
          </button>
        </template>
      </DashboardPageHeader>

      <div
        v-if="gradeWithheld"
        role="status"
        data-testid="readiness-banner"
        class="bg-risk-high-bg border-risk-high-border text-risk-high-text mb-4 rounded-[var(--radius-card)] border p-3 text-sm"
      >
        {{ gradeBanner }}
      </div>

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
        <div>
          <ScoreRing
            :score="scan.score"
            :grade="scan.grade"
            :coverage="coverage"
            :reason="gradeReason"
          />
          <div v-if="gradeWithheld" data-testid="grade-tile" class="mt-3 pl-1">
            <p class="text-ink-400 font-mono text-xs tracking-widest uppercase">Grade</p>
            <p class="text-ink-900 text-lg font-semibold">No letter</p>
          </div>
        </div>
        <div>
          <CoverageBanner
            v-if="!legacy && coverageBannerNote"
            :note="coverageBannerNote ?? ''"
            :evidence-note="detectorNote"
          />
          <ScoreCard
            v-else
            :scan-id="scan.id"
            :score="scan.score"
            :grade="coverage.state === 'partial' ? null : scan.grade"
            :previous-score="scan.previousScore"
            :coverage="coverage.state"
            :coverage-note="coverage.note"
            :counts="scan.counts"
            :legacy="legacy"
          />
          <SeverityBar :counts="scan.counts" class="mt-5" />
        </div>
      </section>

      <div class="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Score"
          :value="scan.score === null ? '—' : scan.score.toFixed(1)"
          caption="Readiness score"
        />
        <MetricTile
          label="Evidence coverage"
          :value="evidenceCoverage"
          :caption="
            legacy ? 'Legacy scoring: no evidence coverage' : 'Weight of determinable controls'
          "
          :tone="
            assessment && assessment.evidenceCoverage !== null && assessment.evidenceCoverage < 0.5
              ? 'warning'
              : 'neutral'
          "
          test-id="evidence-coverage-tile"
        />
        <MetricTile
          label="Open gaps"
          :value="String(openGaps)"
          caption="Cited evidence of a gap"
          :tone="openGaps > 0 ? 'gap' : 'neutral'"
          test-id="open-gaps-tile"
        />
        <MetricTile
          label="Consent gating"
          :value="consentGating"
          :caption="consentCaption"
          test-id="consent-gating-tile"
        />
      </div>

      <ScrollReveal>
        <section
          class="bg-surface mt-6 rounded-[var(--radius-card)] border border-[var(--color-status-partial-border)] p-4"
          aria-labelledby="unknown-heading"
        >
          <MotionTextReveal
            id="unknown-heading"
            as="h2"
            text="Could not determine"
            class="text-ink-900 text-sm font-semibold"
          />
          <p class="text-ink-500 mt-2 text-sm">
            These controls need evidence the code scan could not determine. Add a detector, provide
            documentation, or verify manually. Unknown controls never become evidence of a
            safeguard.
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <HoverCard
              v-for="code in unknownChips"
              :key="code"
              label="Could not determine"
              detail="This control has no determinable code evidence in this scan."
            >
              <span
                class="border-ink-200 rounded-[var(--radius-pill)] border px-2 py-0.5 font-mono text-xs"
                >{{ code }}</span
              >
            </HoverCard>
          </div>
        </section>
      </ScrollReveal>

      <CommandPalette
        :open="paletteOpen"
        :items="[
          { id: 'findings', label: 'Findings', href: `/app/scans/${scan.id}/findings` },
          { id: 'coverage', label: 'Coverage', href: `/app/scans/${scan.id}/coverage` },
          { id: 'remediation', label: 'Remediation', href: `/app/scans/${scan.id}/remediation` },
          { id: 'rules', label: 'Rules', href: '/app/rules' },
        ]"
        @navigate="onPaletteNavigate"
        @close="paletteOpen = false"
      />

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
