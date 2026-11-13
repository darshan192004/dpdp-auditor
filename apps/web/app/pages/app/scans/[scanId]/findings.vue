<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';

import FindingDrawer from '~/components/findings/FindingDrawer.vue';
import FindingsFilterBar from '~/components/findings/FindingsFilterBar.vue';
import FindingsTable from '~/components/findings/FindingsTable.vue';
import PageHeader from '~/components/shell/PageHeader.vue';
import ErrorState from '~/components/ui/ErrorState.vue';
import { useAppContext } from '~/composables/useAppContext';
import { useFindingsQuery } from '~/composables/useFindingsQuery';
import {
  type FindingSort,
  type FindingStatus,
  type FindingView,
  type FindingsPage,
  type FindingsPagination,
} from '~~/shared/findings';
import { serialiseFindingsQuery } from '~~/shared/findings-query';

definePageMeta({ layout: 'app' });

const STATUS_LABELS: Record<FindingStatus, string> = {
  open: 'open',
  false_positive: 'false positive',
  accepted_risk: 'accepted risk',
  fixed: 'fixed',
  reopened: 'reopened',
};

const route = useRoute();
const scanId = computed(() => String(route.params.scanId));
const shortId = computed(() => scanId.value.slice(0, 8));

const { filters, update, clear } = useFindingsQuery();
const { org } = useAppContext();
const role = computed(() => org.value?.role ?? 'viewer');

const requestUrl = computed(() => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(serialiseFindingsQuery(filters.value))) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else params.set(key, value);
  }
  const search = params.toString();
  return `/api/v1/scan/${scanId.value}/findings${search === '' ? '' : `?${search}`}`;
});

const { data, status, error, refresh } = await useFetch<FindingsPage>(requestUrl);

const findings = computed<FindingView[]>(() => data.value?.data ?? []);
const pagination = computed<FindingsPagination>(
  () =>
    data.value?.pagination ?? {
      page: filters.value.page,
      pageSize: filters.value.pageSize,
      totalItems: 0,
      totalPages: 1,
    },
);
const loading = computed(() => status.value === 'pending');

const loadError = computed(() => {
  if (!error.value) return null;
  const failure = error.value as {
    statusMessage?: string;
    data?: { error?: { message?: string; requestId?: string } };
  };
  return {
    message: failure.data?.error?.message ?? 'The findings could not be loaded.',
    requestId: failure.data?.error?.requestId,
  };
});

const selectedId = ref<string | null>(null);
const selected = computed(
  () => findings.value.find((finding) => finding.id === selectedId.value) ?? null,
);

const triaging = ref(false);
const notice = ref('');
const triageError = ref<string | null>(null);

function openFinding(finding: FindingView): void {
  selectedId.value = finding.id;
  triageError.value = null;
}

function onDrawerOpen(open: boolean): void {
  if (open) return;
  const id = selectedId.value;
  selectedId.value = null;
  void nextTick(() => {
    if (id === null) return;
    document.getElementById(`finding-row-${id}`)?.focus();
  });
}

async function onTriage(draft: {
  status: FindingStatus;
  note?: string;
  externalUrl?: string;
}): Promise<void> {
  if (selectedId.value === null) return;

  triaging.value = true;
  triageError.value = null;
  try {
    await $fetch(`/api/v1/findings/${selectedId.value}`, { method: 'PATCH', body: draft });
    notice.value = `Disposition saved: ${STATUS_LABELS[draft.status]}.`;
    await refresh();
  } catch (failure) {
    const payload = failure as { data?: { error?: { message?: string } } };
    triageError.value = payload.data?.error?.message ?? 'The disposition could not be saved.';
  } finally {
    triaging.value = false;
  }
}

function setSort(sort: FindingSort): void {
  void update({ sort });
}

function setPage(page: number): void {
  void update({ page });
}

function setPageSize(pageSize: number): void {
  void update({ pageSize });
}

function clearFilters(): void {
  void clear();
}
</script>

<template>
  <div class="space-y-4">
    <PageHeader
      title="Findings"
      :breadcrumbs="[
        { label: 'Scans', to: '/app/scans' },
        { label: shortId, to: `/app/scans/${scanId}` },
        { label: 'Findings' },
      ]"
    />

    <div class="border-ink-200 bg-surface rounded-[var(--radius-card)] border px-4 py-3">
      <FindingsFilterBar
        :filters="filters"
        :total-items="pagination.totalItems"
        @update="update"
        @clear="clearFilters"
      />
    </div>

    <p
      v-if="notice"
      role="status"
      class="border-brand-500 bg-brand-50 text-brand-900 rounded-[var(--radius-card)] border px-3 py-2 text-sm"
    >
      {{ notice }}
    </p>
    <p
      v-if="triageError"
      role="alert"
      class="border-risk-critical-border bg-risk-critical-bg text-risk-critical-text rounded-[var(--radius-card)] border px-3 py-2 text-sm"
    >
      {{ triageError }}
    </p>

    <ErrorState
      v-if="loadError"
      :message="loadError.message"
      :request-id="loadError.requestId ?? null"
      @retry="refresh"
    />

    <FindingsTable
      v-else
      :findings="findings"
      :pagination="pagination"
      :sort="filters.sort"
      :loading="loading"
      :selected-id="selectedId"
      @select="openFinding"
      @update:sort="setSort"
      @update:page="setPage"
      @update:page-size="setPageSize"
      @clear="clearFilters"
    />

    <FindingDrawer
      :open="selectedId !== null"
      :finding="selected"
      :role="role"
      :submitting="triaging"
      @update:open="onDrawerOpen"
      @triage="onTriage"
    />
  </div>
</template>
