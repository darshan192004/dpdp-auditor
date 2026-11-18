<script setup lang="ts">
import { computed, ref } from 'vue';

import NewScanDetail from '~/components/new/NewScanDetail.vue';
import ScoreCard from '~/components/scan/ScoreCard.vue';
import ScanProgress from '~/components/scan/ScanProgress.vue';
import ScanTimeline from '~/components/scan/ScanTimeline.vue';
import SectionBreakdown from '~/components/scan/SectionBreakdown.vue';
import PageHeader from '~/components/shell/PageHeader.vue';
import ErrorState from '~/components/ui/ErrorState.vue';
import { useAppContext } from '~/composables/useAppContext';
import { useScanPolling } from '~/composables/useScanPolling';
import {
  canManageScans,
  coverageFor,
  formatDuration,
  formatTimestamp,
  isTerminalStatus,
  scanCancelPath,
  scanEventsPath,
  scanSections,
  SCAN_STATUS_LABELS,
  shortCommit,
  type ScanEvent,
} from '~~/shared/scan';

definePageMeta({ layout: 'app' });

const newUi = useRuntimeConfig().public.newUi;

const route = useRoute();
const scanId = computed(() => String(route.params.scanId));
const shortId = computed(() => scanId.value.slice(0, 8));

/**
 * One fetch owns the scan detail. `useScanPolling` server-renders the first
 * response (design §7.3), then polls while the scan is active and refreshes the
 * timeline on the same tick, so progress and events never drift apart.
 */
const { scan, status, error, refresh, pollError, retry } = await useScanPolling(scanId);

const eventsRequest = await useFetch<{ data: ScanEvent[] }>(() => scanEventsPath(scanId.value));
const events = computed<ScanEvent[]>(() => eventsRequest.data.value?.data ?? []);
const eventsLoading = computed(() => eventsRequest.status.value === 'pending');
const eventsError = computed(() => {
  if (!eventsRequest.error.value) return null;
  return (eventsRequest.error.value as { data?: { error?: { message?: string } } }).data?.error
    ?.message;
});

const { org } = useAppContext();
const canExport = computed(() => ['auditor', 'admin', 'owner'].includes(org.value?.role ?? ''));
const canCancel = computed(() => canManageScans(org.value?.role ?? null));

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
const terminal = computed(() => scan.value !== null && isTerminalStatus(scan.value.status));
const statusLabel = computed(() =>
  scan.value === null ? '' : SCAN_STATUS_LABELS[scan.value.status],
);

const cancelling = ref(false);
const cancelError = ref<string | null>(null);

function messageFrom(cause: unknown, fallback: string): string {
  const message = (cause as { data?: { error?: { message?: unknown } } }).data?.error?.message;
  return typeof message === 'string' ? message : fallback;
}

async function cancelScan(): Promise<void> {
  if (cancelling.value) return;
  cancelling.value = true;
  cancelError.value = null;
  try {
    await $fetch(scanCancelPath(scanId.value), {
      method: 'POST',
      body: { reason: 'Cancelled from the scan view' },
    });
    await refresh();
    await eventsRequest.refresh();
  } catch (cause) {
    cancelError.value = messageFrom(cause, 'The scan could not be cancelled.');
  } finally {
    cancelling.value = false;
  }
}

async function retryEvents(): Promise<void> {
  await eventsRequest.refresh();
}
</script>

<template>
  <NewScanDetail
    v-if="newUi"
    :loading="status === 'pending'"
    :scan="
      scan === null
        ? null
        : {
            id: scan.id,
            status: scan.status,
            score: scan.score,
            grade: scan.grade,
            coverage: scan.status === 'completed' ? coverage.state : 'not scored',
            repository: scan.repository.fullName,
            note: coverage.note,
          }
    "
  />
  <div v-else class="space-y-5">
    <PageHeader
      :title="scan?.repository.fullName ?? 'Scan'"
      :breadcrumbs="[{ label: 'Scans', to: '/app/scans' }, { label: shortId }]"
    >
      <template #actions>
        <div class="flex flex-wrap items-center gap-2">
          <ReportDownloadButton v-if="isCompleted" :scan-id="scanId" :can-export="canExport" />
          <NuxtLink
            :to="`/app/scans/${scanId}/findings`"
            class="bg-brand-500 hover:bg-brand-600 focus-visible:ring-brand-500 text-ink-50 inline-flex items-center rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            View findings
          </NuxtLink>
        </div>
      </template>
    </PageHeader>

    <ErrorState
      v-if="loadError"
      :message="loadError.message"
      :request-id="loadError.requestId ?? null"
      @retry="refresh"
    />

    <template v-else>
      <ScanProgress
        v-if="scan !== null"
        :scan-id="scanId"
        :status="scan.status"
        :coverage="scan.coverage"
        :timestamps="scan.timestamps"
        :can-cancel="canCancel"
        :cancelling="cancelling"
        @cancel="cancelScan"
      />

      <p
        v-if="cancelError"
        role="alert"
        class="border-risk-critical-border bg-risk-critical-bg text-risk-critical-text rounded-[var(--radius-card)] border px-3 py-2 text-sm"
      >
        {{ cancelError }}
      </p>

      <p
        v-if="pollError"
        role="status"
        class="border-status-partial-border bg-status-partial-bg text-status-partial-text flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] border px-3 py-2 text-xs"
      >
        <span>{{ pollError }}</span>
        <button
          type="button"
          class="focus-visible:ring-brand-500 rounded-[var(--radius-control)] px-2 py-1 font-medium underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
          @click="retry"
        >
          Retry now
        </button>
      </p>

      <dl
        class="bg-surface divide-ink-200 grid grid-cols-2 divide-y rounded-[var(--radius-card)] shadow-[var(--shadow-card)] sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-6 lg:divide-x"
      >
        <div class="px-4 py-3">
          <dt class="text-ink-400 font-mono text-xs tracking-widest uppercase">Status</dt>
          <dd
            v-if="scan !== null"
            class="text-ink-800 mt-1 inline-flex items-center gap-1.5 text-sm"
          >
            <span
              class="h-1.5 w-1.5 rounded-full"
              :class="isCompleted ? 'bg-status-compliant-text' : 'bg-status-partial-text'"
              aria-hidden="true"
            />
            {{ statusLabel }}
          </dd>
          <dd v-else class="text-ink-500 mt-1 text-sm">—</dd>
        </div>
        <div class="px-4 py-3">
          <dt class="text-ink-400 font-mono text-xs tracking-widest uppercase">Commit</dt>
          <dd v-if="scan !== null" class="text-ink-800 mt-1 font-mono text-xs">
            {{ scan.ref }} @ {{ shortCommit(scan.commitSha) }}
          </dd>
          <dd v-else class="text-ink-500 mt-1 text-sm">—</dd>
        </div>
        <div class="px-4 py-3">
          <dt class="text-ink-400 font-mono text-xs tracking-widest uppercase">Completed</dt>
          <dd class="text-ink-800 mt-1 text-sm tabular-nums">
            {{ scan?.timestamps.completedAt ? formatTimestamp(scan.timestamps.completedAt) : '—' }}
          </dd>
        </div>
        <div class="px-4 py-3">
          <dt class="text-ink-400 font-mono text-xs tracking-widest uppercase">Duration</dt>
          <dd class="text-ink-800 mt-1 text-sm tabular-nums">
            {{
              scan?.timestamps.durationMs != null ? formatDuration(scan.timestamps.durationMs) : '—'
            }}
          </dd>
        </div>
        <div class="px-4 py-3">
          <dt class="text-ink-400 font-mono text-xs tracking-widest uppercase">Rule pack</dt>
          <dd class="text-ink-800 mt-1 font-mono text-xs">{{ scan?.rulePackVersion ?? '—' }}</dd>
        </div>
        <div class="px-4 py-3">
          <dt class="text-ink-400 font-mono text-xs tracking-widest uppercase">Scan</dt>
          <dd class="text-ink-800 mt-1 font-mono text-xs">{{ shortId }}</dd>
        </div>
      </dl>

      <ScoreCard
        :scan-id="scanId"
        :score="scan?.score ?? null"
        :grade="scan?.grade ?? null"
        :previous-score="scan?.previousScore ?? null"
        :coverage="coverage.state"
        :coverage-note="coverage.note"
        :counts="scan?.counts ?? { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 }"
        :is-loading="status === 'pending'"
      />

      <p
        v-if="scan !== null && !isCompleted && !terminal"
        role="status"
        class="bg-surface-raised text-ink-700 rounded-[var(--radius-card)] px-4 py-3 text-sm"
      >
        This scan is {{ statusLabel.toLowerCase() }}. The score appears when it completes.
      </p>

      <SectionBreakdown v-if="sections.length > 0" :scan-id="scanId" :rows="sections" />

      <ErrorState
        v-if="eventsError"
        message="The scan timeline could not be loaded."
        @retry="retryEvents"
      />
      <ScanTimeline v-else :events="events" :is-loading="eventsLoading" />

      <p class="text-ink-500 text-xs">
        Scores are engineering signals, not legal advice. Section 12 is not assessed by code.
      </p>
    </template>
  </div>
</template>
