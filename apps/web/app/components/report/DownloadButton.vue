<script setup lang="ts">
/**
 * P5-21: request a PDF for a completed scan, poll its status, then offer the
 * download (docs/api.md 6.1-6.3). The idempotency key is generated once per
 * user intent and reused on retry, so a retry never creates a second report.
 */
import { onBeforeUnmount, ref } from 'vue';

type ReportStatus = 'queued' | 'rendering' | 'ready' | 'failed';

const props = withDefaults(
  defineProps<{ scanId: string; reportId?: string | undefined; canExport?: boolean }>(),
  { reportId: undefined, canExport: true },
);

const state = ref<'idle' | 'requesting' | 'polling' | 'ready' | 'failed'>('idle');
const resolvedReportId = ref<string | null>(null);
const message = ref<string | null>(null);
let idempotencyKey: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let attempts = 0;
let disposed = false;
const abortController = new AbortController();

function clearTimer(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

onBeforeUnmount(() => {
  disposed = true;
  abortController.abort();
  clearTimer();
});

function messageFrom(cause: unknown): string {
  const data = (cause as { data?: { error?: { message?: unknown } } } | null)?.data;
  const text = data?.error?.message;
  return typeof text === 'string' ? text : 'The report could not be requested. Try again.';
}

async function poll(): Promise<void> {
  clearTimer();
  if (disposed || resolvedReportId.value === null) return;
  attempts += 1;
  if (attempts > 40) {
    state.value = 'failed';
    message.value = 'Rendering is taking longer than expected. Try again later.';
    return;
  }
  try {
    const response = await $fetch<{ data: { status: ReportStatus } }>(
      `/api/v1/report/pdf/${resolvedReportId.value}`,
      { signal: abortController.signal },
    );
    if (disposed) return;
    if (response.data.status === 'ready') {
      state.value = 'ready';
      return;
    }
    if (response.data.status === 'failed') {
      idempotencyKey = null;
      state.value = 'failed';
      message.value = 'Rendering failed. Try again.';
      return;
    }
    timer = setTimeout(() => void poll(), 3000);
  } catch (cause) {
    if (disposed) return;
    state.value = 'failed';
    message.value = messageFrom(cause);
  }
}

async function request(): Promise<void> {
  if (disposed || !props.canExport || state.value === 'requesting' || state.value === 'polling')
    return;
  message.value = null;
  // The report preview already has a reserved report id. Reuse it instead of
  // creating a second report for the same scan (docs/api.md §6.1).
  if (props.reportId) {
    resolvedReportId.value = props.reportId;
    state.value = 'polling';
    attempts = 0;
    await poll();
    return;
  }
  state.value = 'requesting';
  if (idempotencyKey === null) idempotencyKey = crypto.randomUUID();
  try {
    const response = await $fetch<{ data: { id: string; status: ReportStatus } }>(
      '/api/v1/report/pdf',
      {
        method: 'POST',
        signal: abortController.signal,
        body: { scanId: props.scanId },
        headers: { 'Idempotency-Key': idempotencyKey },
      },
    );
    if (disposed) return;
    resolvedReportId.value = response.data.id;
    if (response.data.status === 'failed') {
      idempotencyKey = null;
      state.value = 'failed';
      message.value = 'Rendering failed. Try again.';
      return;
    }
    if (response.data.status === 'ready') {
      state.value = 'ready';
      return;
    }
    state.value = 'polling';
    attempts = 0;
    timer = setTimeout(() => void poll(), 2000);
  } catch (cause) {
    if (disposed) return;
    state.value = 'failed';
    message.value = messageFrom(cause);
  }
}

function reset(): void {
  clearTimer();
  idempotencyKey = null;
  resolvedReportId.value = null;
  state.value = 'idle';
  message.value = null;
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <button
      v-if="state === 'idle' || state === 'failed'"
      type="button"
      :disabled="!canExport"
      class="bg-brand-500 hover:bg-brand-600 focus-visible:ring-brand-500 text-ink-50 inline-flex items-center rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
      @click="request"
    >
      {{ state === 'failed' ? 'Retry PDF' : 'Export PDF' }}
    </button>

    <p
      v-if="state === 'requesting' || state === 'polling'"
      role="status"
      class="text-ink-600 text-sm"
    >
      {{ state === 'requesting' ? 'Requesting report.' : 'Rendering PDF.' }}
    </p>

    <template v-if="state === 'ready' && resolvedReportId !== null">
      <a
        :href="`/api/v1/report/pdf/${resolvedReportId}/download`"
        class="bg-brand-500 hover:bg-brand-600 focus-visible:ring-brand-500 text-ink-50 inline-flex items-center rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        Download PDF
      </a>
      <NuxtLink
        :to="`/report/${resolvedReportId}`"
        class="text-ink-600 hover:text-ink-900 focus-visible:ring-brand-500 rounded-[var(--radius-control)] px-2.5 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        Preview
      </NuxtLink>
      <button
        type="button"
        class="text-ink-500 hover:text-ink-800 focus-visible:ring-brand-500 rounded-[var(--radius-control)] px-2 py-1.5 text-xs font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        @click="reset"
      >
        Dismiss
      </button>
    </template>

    <p
      v-if="state === 'failed' && message !== null"
      role="alert"
      class="text-risk-critical-text text-sm"
    >
      {{ message }}
    </p>
  </div>
</template>
