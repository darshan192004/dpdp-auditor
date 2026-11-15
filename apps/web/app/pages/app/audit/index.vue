<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import PageHeader from '~/components/shell/PageHeader.vue';
import EmptyState from '~/components/ui/EmptyState.vue';
import ErrorState from '~/components/ui/ErrorState.vue';
import { formatTimestamp } from '~~/shared/scan';
import type { AuditLogListResponse } from '~~/shared/audit';

definePageMeta({ layout: 'app' });

const filters = reactive({
  action: '',
  actorUserId: '',
  from: '',
  to: '',
  page: 1,
  pageSize: 50,
});

const queryParams = computed(() => {
  const params = new URLSearchParams();
  if (filters.action) params.set('action', filters.action);
  if (filters.actorUserId) params.set('actorUserId', filters.actorUserId);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  params.set('page', filters.page.toString());
  params.set('pageSize', filters.pageSize.toString());
  return params.toString();
});

const { data, status, error, refresh } = await useFetch<AuditLogListResponse>(
  () => `/api/v1/audit-logs?${queryParams.value}`,
  { watch: [queryParams] },
);

const entries = computed(() => data.value?.data ?? []);
const pagination = computed(() => data.value?.pagination);
const loading = computed(() => status.value === 'pending');

const loadError = computed(() => {
  const failure = error.value as {
    statusMessage?: string;
    data?: { error?: { message?: string; requestId?: string } };
  } | null;
  if (!failure) return null;
  return {
    message: failure.data?.error?.message ?? 'The audit log could not be loaded.',
    requestId: failure.data?.error?.requestId,
  };
});

const exportPending = ref(false);
const exportError = ref<string | null>(null);

function resetFilters() {
  filters.action = '';
  filters.actorUserId = '';
  filters.from = '';
  filters.to = '';
  filters.page = 1;
}

function nextPage() {
  if (pagination.value && filters.page < pagination.value.totalPages) {
    filters.page++;
  }
}

function prevPage() {
  if (filters.page > 1) {
    filters.page--;
  }
}

async function exportAuditLogs() {
  exportPending.value = true;
  exportError.value = null;
  try {
    const params = new URLSearchParams();
    if (filters.action) params.set('action', filters.action);
    if (filters.actorUserId) params.set('actorUserId', filters.actorUserId);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    params.set('format', 'json');

    const response = await fetch(`/api/v1/audit-logs/export?${params.toString()}`, {
      credentials: 'same-origin',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message ?? 'Export failed.');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ??
      'audit-logs.jsonl';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (cause) {
    exportError.value = (cause as Error).message ?? 'Export failed. Try again.';
  } finally {
    exportPending.value = false;
  }
}

function formatAction(action: string): string {
  return action
    .split('.')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Audit" :breadcrumbs="[{ label: 'Audit' }]" />

    <ErrorState
      v-if="loadError"
      :message="loadError.message"
      :request-id="loadError.requestId ?? null"
      @retry="refresh"
    />

    <template v-else>
      <p
        v-if="exportError"
        role="alert"
        class="bg-risk-critical-bg text-risk-critical-text rounded-[var(--radius-control)] px-3 py-2 text-sm"
      >
        {{ exportError }}
      </p>

      <section
        aria-labelledby="audit-filters-heading"
        class="bg-surface overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-card)]"
      >
        <div class="border-ink-200 border-b px-4 py-3">
          <h2 id="audit-filters-heading" class="text-ink-900 text-sm font-semibold">Filters</h2>
        </div>
        <form class="space-y-3 px-4 py-4" novalidate @submit.prevent>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label for="filter-action" class="text-ink-700 mb-1 block text-xs font-medium">
                Action
              </label>
              <input
                id="filter-action"
                v-model="filters.action"
                name="action"
                type="text"
                placeholder="scan.started"
                class="border-ink-200 text-ink-900 placeholder:text-ink-400 focus-visible:ring-brand-500 bg-surface w-full rounded-[var(--radius-control)] border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
              />
            </div>
            <div>
              <label for="filter-actor" class="text-ink-700 mb-1 block text-xs font-medium">
                Actor User ID
              </label>
              <input
                id="filter-actor"
                v-model="filters.actorUserId"
                name="actorUserId"
                type="text"
                placeholder="usr_..."
                class="border-ink-200 text-ink-900 placeholder:text-ink-400 focus-visible:ring-brand-500 bg-surface w-full rounded-[var(--radius-control)] border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
              />
            </div>
            <div>
              <label for="filter-from" class="text-ink-700 mb-1 block text-xs font-medium">
                From
              </label>
              <input
                id="filter-from"
                v-model="filters.from"
                name="from"
                type="datetime-local"
                class="border-ink-200 text-ink-900 focus-visible:ring-brand-500 bg-surface w-full rounded-[var(--radius-control)] border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
              />
            </div>
            <div>
              <label for="filter-to" class="text-ink-700 mb-1 block text-xs font-medium">
                To
              </label>
              <input
                id="filter-to"
                v-model="filters.to"
                name="to"
                type="datetime-local"
                class="border-ink-200 text-ink-900 focus-visible:ring-brand-500 bg-surface w-full rounded-[var(--radius-control)] border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
              />
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="bg-brand-500 hover:bg-brand-600 focus-visible:ring-brand-500 text-ink-50 inline-flex items-center rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              @click="filters.page = 1"
            >
              Apply filters
            </button>
            <button
              type="button"
              class="border-ink-200 text-ink-700 hover:bg-ink-50 focus-visible:ring-brand-500 inline-flex items-center rounded-[var(--radius-control)] border bg-transparent px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              @click="resetFilters"
            >
              Reset
            </button>
            <button
              type="button"
              :disabled="exportPending"
              class="border-ink-200 text-ink-700 hover:bg-ink-50 focus-visible:ring-brand-500 inline-flex items-center rounded-[var(--radius-control)] border bg-transparent px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
              @click="exportAuditLogs"
            >
              {{ exportPending ? 'Exporting...' : 'Export NDJSON' }}
            </button>
          </div>
        </form>
      </section>

      <p v-if="loading && entries.length === 0" role="status" class="text-ink-500 text-sm">
        Loading audit trail…
      </p>

      <EmptyState
        v-else-if="entries.length === 0"
        title="No audit entries"
        description="No audit entries match the current filters. Try adjusting the filters or resetting them."
        icon="clipboard-check"
      />

      <section
        v-else
        aria-labelledby="audit-log-heading"
        class="bg-surface overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-card)]"
      >
        <div
          class="border-ink-200 flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3"
        >
          <h2 id="audit-log-heading" class="text-ink-900 text-sm font-semibold">Audit trail</h2>
          <span v-if="pagination" class="text-ink-500 text-xs">
            {{ pagination.totalItems }} {{ pagination.totalItems === 1 ? 'entry' : 'entries' }}
          </span>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <caption class="sr-only">
              Organisation audit log showing actions, actors, resources, and timestamps
            </caption>
            <thead
              class="text-ink-400 border-ink-200 border-b font-mono text-xs tracking-widest uppercase"
            >
              <tr>
                <th scope="col" class="px-4 py-2 font-medium">Timestamp</th>
                <th scope="col" class="px-4 py-2 font-medium">Action</th>
                <th scope="col" class="px-4 py-2 font-medium">Actor</th>
                <th scope="col" class="px-4 py-2 font-medium">Resource</th>
                <th scope="col" class="px-4 py-2 font-medium">IP</th>
              </tr>
            </thead>
            <tbody class="divide-ink-200 divide-y">
              <tr v-for="entry in entries" :key="entry.id">
                <td class="text-ink-600 px-4 py-3 text-xs tabular-nums">
                  {{ formatTimestamp(entry.createdAt) }}
                </td>
                <td class="px-4 py-3">
                  <span class="text-ink-800 block font-mono text-xs">{{ entry.action }}</span>
                  <span class="text-ink-500 block text-xs">{{ formatAction(entry.action) }}</span>
                </td>
                <td class="px-4 py-3">
                  <span class="text-ink-800 block text-xs">{{ entry.actor.name ?? 'System' }}</span>
                  <span class="text-ink-500 block font-mono text-xs">{{ entry.actor.type }}</span>
                </td>
                <td class="px-4 py-3">
                  <span class="text-ink-800 block font-mono text-xs">{{
                    entry.resource.id ?? '—'
                  }}</span>
                  <span class="text-ink-500 block text-xs">{{ entry.resource.type }}</span>
                </td>
                <td class="text-ink-600 px-4 py-3 font-mono text-xs">
                  {{ entry.ip ?? '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div
          v-if="pagination && pagination.totalPages > 1"
          class="border-ink-200 flex items-center justify-between border-t px-4 py-3"
        >
          <button
            type="button"
            :disabled="pagination.page === 1"
            class="text-ink-700 hover:bg-ink-50 focus-visible:ring-brand-500 disabled:text-ink-400 inline-flex items-center rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed"
            @click="prevPage"
          >
            Previous
          </button>
          <span class="text-ink-600 text-xs">
            Page {{ pagination.page }} of {{ pagination.totalPages }}
          </span>
          <button
            type="button"
            :disabled="pagination.page === pagination.totalPages"
            class="text-ink-700 hover:bg-ink-50 focus-visible:ring-brand-500 disabled:text-ink-400 inline-flex items-center rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed"
            @click="nextPage"
          >
            Next
          </button>
        </div>
      </section>

      <p class="text-ink-500 text-xs">
        Audit logs record all actions in this organisation. Export as NDJSON to process with tools
        like jq. Exports are capped at 100,000 rows and emit an <code>audit.exported</code> event.
      </p>
    </template>
  </div>
</template>
