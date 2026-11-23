<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import {
  formatDuration,
  isTerminalStatus,
  scanElapsedMs,
  scannerFailureNote,
  scannerProgress,
  scanStages,
  SCAN_STATUS_LABELS,
  type ScanCoverage,
  type ScannerStatus,
  type ScanStatus,
  type ScanTimestamps,
} from '~~/shared/scan';
import AppIcon from '../ui/AppIcon.vue';

/**
 * Stage-based progress, never a fake percentage (docs/design.md §5.6).
 *
 * Elapsed time ticks locally so the view stays honest between polls; the BFF
 * response remains the only source of scanner status.
 */
const props = withDefaults(
  defineProps<{
    scanId: string;
    status: ScanStatus;
    coverage: ScanCoverage;
    timestamps: ScanTimestamps;
    canCancel?: boolean;
    cancelling?: boolean;
    nowMs?: number | null;
  }>(),
  { canCancel: false, cancelling: false, nowMs: null },
);

const emit = defineEmits<{ cancel: [] }>();

const confirming = ref(false);
const clock = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;

const stages = computed(() =>
  scanStages(props.status, { started: props.timestamps.startedAt !== null }),
);
const scanners = computed(() => scannerProgress(props.coverage));
const failureNote = computed(() => scannerFailureNote(props.coverage));
const elapsed = computed(() =>
  formatDuration(scanElapsedMs(props.timestamps, props.nowMs ?? clock.value)),
);
const terminal = computed(() => isTerminalStatus(props.status));
const showCancel = computed(() => props.canCancel && !terminal.value);
const announcement = computed(() => SCAN_STATUS_LABELS[props.status]);

const STAGE_DOT: Record<string, string> = {
  done: 'bg-brand-500 text-ink-50',
  current: 'border border-brand-500 text-brand-500 bg-surface',
  pending: 'border border-ink-300 bg-surface text-ink-500',
  failed: 'bg-risk-critical-solid text-ink-50',
};

const SCANNER_TONE: Record<ScannerStatus, string> = {
  pending: 'text-ink-500',
  running: 'text-brand-900',
  completed: 'text-status-compliant-text',
  failed: 'text-risk-critical-text',
  timed_out: 'text-risk-high-text',
  skipped: 'text-ink-500',
};

watch(terminal, (finished) => {
  if (finished) confirming.value = false;
});

onMounted(() => {
  if (props.nowMs !== null) return;
  timer = setInterval(() => {
    clock.value = Date.now();
  }, 1_000);
});

onBeforeUnmount(() => {
  if (timer !== undefined) clearInterval(timer);
});
</script>

<template>
  <section
    aria-labelledby="progress-heading"
    class="bg-surface rounded-[var(--radius-card)] p-5 shadow-[var(--shadow-card)]"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="progress-heading" class="text-ink-400 font-mono text-xs tracking-widest uppercase">
          Scan progress
        </h2>
        <p class="text-ink-900 mt-1 text-lg font-semibold">{{ SCAN_STATUS_LABELS[status] }}</p>
      </div>
      <p class="text-ink-500 flex items-baseline gap-1 text-xs">
        Elapsed
        <span data-allow-mismatch="text" class="text-ink-800 font-mono tabular-nums">{{
          elapsed
        }}</span>
        <span
          v-if="!terminal"
          class="scan-spinner border-brand-500 inline-block h-3 w-3 rounded-full border-2 border-t-transparent"
          style="animation: scan-spin 900ms linear infinite"
          aria-hidden="true"
        />
      </p>
    </div>

    <p aria-live="polite" class="sr-only">{{ announcement }}</p>

    <ol aria-label="Scan stages" class="mt-4 flex flex-wrap items-center gap-2">
      <li
        v-for="stage in stages"
        :key="stage.stage"
        :aria-current="stage.state === 'current' ? 'step' : undefined"
        class="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-2 py-1 text-xs font-medium"
      >
        <span
          class="flex h-4 w-4 items-center justify-center rounded-full"
          :class="[STAGE_DOT[stage.state], { 'scan-stage-active': stage.state === 'current' }]"
          :style="
            stage.state === 'current'
              ? { animation: 'scan-pulse 1.4s ease-in-out infinite' }
              : undefined
          "
          aria-hidden="true"
        >
          <AppIcon v-if="stage.state === 'done'" name="check" :size="10" />
          <AppIcon v-else-if="stage.state === 'failed'" name="x" :size="10" />
        </span>
        <span :class="stage.state === 'pending' ? 'text-ink-500' : 'text-ink-800'">{{
          stage.label
        }}</span>
      </li>
    </ol>

    <div v-if="failureNote" role="status" class="mt-4">
      <p
        class="border-status-partial-border bg-status-partial-bg text-status-partial-text flex items-start gap-2 rounded-[var(--radius-card)] border px-3 py-2 text-xs"
      >
        <AppIcon name="alert-triangle" :size="14" class="mt-0.5" />
        {{ failureNote }}
      </p>
    </div>

    <ul aria-label="Scanners" class="divide-ink-200 mt-4 divide-y">
      <li
        v-for="row in scanners"
        :key="row.scanner"
        class="flex items-center justify-between py-2 text-sm"
      >
        <span class="text-ink-800">{{ row.label }}</span>
        <span class="font-medium" :class="SCANNER_TONE[row.status]">{{ row.statusLabel }}</span>
      </li>
    </ul>

    <div v-if="showCancel" class="border-ink-200 mt-4 border-t pt-4">
      <button
        v-if="!confirming"
        type="button"
        class="text-risk-critical-text focus-visible:ring-risk-critical-solid rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        @click="confirming = true"
      >
        Cancel scan
      </button>
      <div v-else class="flex flex-wrap items-center gap-2">
        <p class="text-ink-800 text-sm">Cancel this scan?</p>
        <button
          type="button"
          :disabled="cancelling"
          class="bg-risk-critical-solid text-ink-50 focus-visible:ring-risk-critical-solid inline-flex items-center rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
          @click="emit('cancel')"
        >
          {{ cancelling ? 'Cancelling…' : 'Confirm cancel' }}
        </button>
        <button
          type="button"
          :disabled="cancelling"
          class="text-ink-600 hover:text-ink-900 focus-visible:ring-brand-500 rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-40"
          @click="confirming = false"
        >
          Keep scan
        </button>
      </div>
    </div>
  </section>
</template>
