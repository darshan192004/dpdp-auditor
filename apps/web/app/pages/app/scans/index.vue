<script setup lang="ts">
import { computed, ref } from 'vue';

import PageHeader from '~/components/shell/PageHeader.vue';
import EmptyState from '~/components/ui/EmptyState.vue';
import ErrorState from '~/components/ui/ErrorState.vue';
import {
  SCAN_STATUSES,
  SCAN_STATUS_LABELS,
  formatScore,
  formatTimestamp,
  type ScanListPage,
  type ScanStatus,
} from '~~/shared/scan';

definePageMeta({ layout: 'app' });

const status = ref<'' | ScanStatus>('');
const page = ref(1);

/**
 * Reactive query string: useFetch re-requests automatically when a filter
 * or page changes, and the URL stays shareable/bookmarkable.
 */
const qs = computed(() => {
  const params = new URLSearchParams();
  if (status.value !== '') params.set('status', status.value);
  if (page.value > 1) params.set('page', String(page.value));
  const serialized = params.toString();
  return serialized === '' ? '' : `?${serialized}`;
});

const scansRequest = await useFetch<{ data: ScanListPage }>(() => `/api/v1/scans${qs.value}`);

const items = computed(() => scansRequest.data.value?.data.items ?? []);
const pagination = computed(() => scansRequest.data.value?.data.pagination);
const loading = computed(() => scansRequest.status.value === 'pending');
const loadingPage = computed(() => loading.value && items.value.length === 0);

const loadError = computed(() => {
  const failure = scansRequest.error.value as {
    data?: { error?: { message?: string; requestId?: string } };
  } | null;
  if (!failure) return null;
  return {
    message: failure.data?.error?.message ?? 'Scans could not be loaded.',
    requestId: failure.data?.error?.requestId,
  };
});

function statusDot(scan: { status: ScanStatus }): string {
  if (scan.status === 'completed') return 'bg-status-compliant-text';
  if (scan.status === 'failed' || scan.status === 'expired') return 'bg-risk-critical-text';
  if (scan.status === 'cancelled') return 'bg-ink-400';
  return 'bg-status-partial-text';
}

function changePage(next: number): void {
  if (next < 1) return;
  const totalPages = pagination.value?.totalPages ?? 1;
  if (next > totalPages) return;
  page.value = next;
}
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Scans" :breadcrumbs="[{ label: 'Scans' }]" />

    <div
      class="bg-surface flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[var(--radius-card)] px-4 py-3 shadow-[var(--shadow-card)]"
      role="group"
      aria-label="Filter scans by status"
    >
      <span class="text-ink-400 font-mono text-xs tracking-widest uppercase">Status</span>
      <div class="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Status filter">
        <button
          v-for="option in [
            { value: '' as const, label: 'All' },
            ...SCAN_STATUSES.map((s) => ({ value: s, label: SCAN_STATUS_LABELS[s] })),
          ]"
          :key="option.value"
          type="button"
          role="radio"
          :aria-checked="status === option.value"
          :disabled="loading"
          class="focus-visible:ring-brand-500 rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
          :class="
            status === option.value
              ? 'bg-brand-500 text-ink-50'
              : 'bg-ink-100 text-ink-700 hover:bg-ink-200 hover:text-ink-900'
          "
          @click="status = option.value"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

    <ErrorState
      v-if="loadError"
      :message="loadError.message"
      :request-id="loadError.requestId ?? null"
      @retry="scansRequest.refresh"
    />

    <p v-else-if="loadingPage" role="status" class="text-ink-500 text-sm">Loading scans.</p>

    <EmptyState
      v-else-if="items.length === 0"
      title="No scans yet"
      description="Scans run against the default branch and record the evidence behind each finding. Connect a repository and start a scan to see it here."
      icon="search"
    />

    <template v-else>
      <section
        aria-labelledby="scan-list-heading"
        class="bg-surface overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-card)]"
      >
        <div
          class="border-ink-200 flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3"
        >
          <h2 id="scan-list-heading" class="text-ink-900 text-sm font-semibold">Recent scans</h2>
          <span class="text-ink-500 text-xs tabular-nums">
            {{ pagination?.totalItems ?? items.length }} total
          </span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <caption class="sr-only">
              Scan history with repository, status, score, grade, and completion time
            </caption>
            <thead
              class="text-ink-400 border-ink-200 border-b font-mono text-xs tracking-widest uppercase"
            >
              <tr>
                <th scope="col" class="px-4 py-2 font-medium">Repository</th>
                <th scope="col" class="px-4 py-2 font-medium">Status</th>
                <th scope="col" class="px-4 py-2 text-right font-medium">Score</th>
                <th scope="col" class="px-4 py-2 text-right font-medium">Grade</th>
                <th scope="col" class="px-4 py-2 text-right font-medium">Findings</th>
                <th scope="col" class="px-4 py-2 text-right font-medium">Completed</th>
                <th scope="col" class="px-4 py-2 text-right font-medium">
                  <span class="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody class="divide-ink-200 divide-y">
              <tr v-for="scan in items" :key="scan.id">
                <td class="px-4 py-3">
                  <NuxtLink
                    :to="`/app/scans/${encodeURIComponent(scan.id)}`"
                    class="text-ink-900 hover:text-brand-600 focus-visible:ring-brand-500 rounded-[var(--radius-control)] font-mono text-xs font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    {{ scan.repositoryFullName }}
                  </NuxtLink>
                </td>
                <td class="text-ink-700 px-4 py-3 text-xs">
                  <span class="inline-flex items-center gap-1.5">
                    <span
                      :class="statusDot(scan)"
                      class="h-1.5 w-1.5 rounded-full"
                      aria-hidden="true"
                    />
                    {{ SCAN_STATUS_LABELS[scan.status] }}
                  </span>
                </td>
                <td class="text-ink-900 px-4 py-3 text-right text-sm tabular-nums">
                  {{ formatScore(scan.score) }}
                </td>
                <td class="px-4 py-3 text-right">
                  <span
                    v-if="scan.grade !== null"
                    class="border-brand-700/60 bg-brand-50 text-brand-900 inline-flex items-center rounded-[var(--radius-pill)] border px-2 py-0.5 text-xs font-semibold"
                    >{{ scan.grade }}</span
                  >
                  <span v-else class="text-ink-500 text-xs">withheld</span>
                </td>
                <td class="text-ink-700 px-4 py-3 text-right text-xs tabular-nums">
                  {{ scan.counts.total }}
                </td>
                <td class="text-ink-600 px-4 py-3 text-right text-xs tabular-nums">
                  {{ formatTimestamp(scan.completedAt) }}
                </td>
                <td class="px-4 py-3 text-right">
                  <NuxtLink
                    :to="`/app/scans/${encodeURIComponent(scan.id)}`"
                    class="text-ink-600 hover:text-ink-900 focus-visible:ring-brand-500 rounded-[var(--radius-control)] px-2 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    View
                  </NuxtLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div
          v-if="pagination !== undefined && pagination.totalPages > 1"
          class="border-ink-200 flex items-center justify-between border-t px-4 py-2.5"
        >
          <button
            type="button"
            :disabled="page <= 1 || loading"
            class="text-ink-600 hover:text-ink-900 focus-visible:ring-brand-500 rounded-[var(--radius-control)] px-2.5 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            @click="changePage(page - 1)"
          >
            Previous
          </button>
          <span class="text-ink-500 text-xs tabular-nums">
            Page {{ pagination.page }} of {{ pagination.totalPages }}
          </span>
          <button
            type="button"
            :disabled="page >= pagination.totalPages || loading"
            class="text-ink-600 hover:text-ink-900 focus-visible:ring-brand-500 rounded-[var(--radius-control)] px-2.5 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            @click="changePage(page + 1)"
          >
            Next
          </button>
        </div>
      </section>
    </template>
  </div>
</template>
