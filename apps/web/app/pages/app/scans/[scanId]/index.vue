<script setup lang="ts">
import { computed } from 'vue';

import ScoreCard from '~/components/scan/ScoreCard.vue';
import SectionBreakdown from '~/components/scan/SectionBreakdown.vue';
import PageHeader from '~/components/shell/PageHeader.vue';
import ErrorState from '~/components/ui/ErrorState.vue';
import {
  coverageFor,
  formatDuration,
  formatTimestamp,
  scanSections,
  SCAN_STATUS_LABELS,
  shortCommit,
  type ScanDetail,
} from '~~/shared/scan';

definePageMeta({ layout: 'app' });

const route = useRoute();
const scanId = computed(() => String(route.params.scanId));
const shortId = computed(() => scanId.value.slice(0, 8));

const { data, status, error, refresh } = await useFetch<{ data: ScanDetail }>(
  () => `/api/v1/scan/${scanId.value}`,
);

const scan = computed<ScanDetail | null>(() => data.value?.data ?? null);
const loading = computed(() => status.value === 'pending');

const loadError = computed(() => {
  if (!error.value) return null;
  const failure = error.value as {
    statusMessage?: string;
    data?: { error?: { message?: string; requestId?: string } };
  };
  return {
    message: failure.data?.error?.message ?? 'The scan could not be loaded.',
    requestId: failure.data?.error?.requestId,
  };
});

/**
 * Coverage only means something for a completed scan. An in-progress scan is
 * "not scored yet", not "partial coverage".
 */
const coverage = computed(() => {
  if (scan.value === null || scan.value.status !== 'completed') {
    return { state: 'full' as const, note: null };
  }
  return coverageFor(scan.value.coverage);
});

const sections = computed(() =>
  scan.value === null ? [] : scanSections(scan.value.sectionScores),
);

const isCompleted = computed(() => scan.value?.status === 'completed');
const statusLabel = computed(() =>
  scan.value === null ? '' : SCAN_STATUS_LABELS[scan.value.status],
);
</script>

<template>
  <div class="space-y-5">
    <PageHeader
      :title="scan?.repository.fullName ?? 'Scan'"
      :breadcrumbs="[{ label: 'Scans', to: '/app/scans' }, { label: shortId }]"
    >
      <template #actions>
        <NuxtLink
          :to="`/app/scans/${scanId}/findings`"
          class="bg-brand-700 hover:bg-brand-900 focus-visible:ring-brand-500 inline-flex items-center rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium text-white focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          View findings
        </NuxtLink>
      </template>
    </PageHeader>

    <ErrorState
      v-if="loadError"
      :message="loadError.message"
      :request-id="loadError.requestId ?? null"
      @retry="refresh"
    />

    <template v-else>
      <div class="text-ink-600 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span v-if="scan !== null" class="inline-flex items-center gap-1.5">
          <span
            class="h-1.5 w-1.5 rounded-full"
            :class="isCompleted ? 'bg-status-compliant-text' : 'bg-status-partial-text'"
            aria-hidden="true"
          />
          {{ statusLabel }}
        </span>
        <span v-if="scan !== null" class="font-mono">
          {{ scan.ref }} @ {{ shortCommit(scan.commitSha) }}
        </span>
        <span v-if="scan?.timestamps.completedAt" class="tabular-nums">
          Completed {{ formatTimestamp(scan.timestamps.completedAt) }}
        </span>
        <span v-if="scan?.timestamps.durationMs != null" class="tabular-nums">
          {{ formatDuration(scan.timestamps.durationMs) }}
        </span>
        <span v-if="scan?.rulePackVersion" class="font-mono">
          pack {{ scan.rulePackVersion }}
        </span>
        <span class="font-mono">scan {{ shortId }}</span>
      </div>

      <ScoreCard
        :scan-id="scanId"
        :score="scan?.score ?? null"
        :grade="scan?.grade ?? null"
        :previous-score="scan?.previousScore ?? null"
        :coverage="coverage.state"
        :coverage-note="coverage.note"
        :counts="scan?.counts ?? { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 }"
        :is-loading="loading"
      />

      <p
        v-if="scan !== null && !isCompleted"
        role="status"
        class="border-ink-200 bg-ink-50 text-ink-700 rounded-[var(--radius-card)] border px-4 py-3 text-sm"
      >
        This scan is {{ statusLabel.toLowerCase() }}. The score appears when it completes.
      </p>

      <SectionBreakdown v-if="sections.length > 0" :scan-id="scanId" :rows="sections" />

      <p class="text-ink-500 text-xs">
        Scores are engineering signals, not legal advice. Section 12 is not assessed by code.
      </p>
    </template>
  </div>
</template>
