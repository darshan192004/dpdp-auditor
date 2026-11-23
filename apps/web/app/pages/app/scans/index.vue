<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import ScanTable from '~/components/dashboard/ScanTable.vue';
import StartScanDrawer from '~/components/dashboard/StartScanDrawer.vue';
import DsErrorState from '~/components/ds/DsErrorState.vue';
import DashboardPageHeader from '~/components/dashboard/DashboardPageHeader.vue';
import { useAppContext } from '~/composables/useAppContext';
import { useToasts } from '~/composables/useToasts';
import { apiErrorMessage } from '~~/shared/api-error';
import type { SavedRepoView } from '~~/shared/repo';
import type { OrgSummary } from '~~/shared/org';
import {
  SCAN_STATUSES,
  type ScanQuota,
  canManageScans,
  scanSubmitPath,
  type ScanProfile,
  type ScanStatus,
} from '~~/shared/scan';

const route = useRoute();
const router = useRouter();
const { org } = useAppContext();
const { push } = useToasts();
const canSubmit = computed(() => canManageScans(org.value?.role ?? null));

const status = computed<'' | ScanStatus>(() => {
  const value = route.query.status;
  return typeof value === 'string' && SCAN_STATUSES.includes(value as ScanStatus)
    ? (value as ScanStatus)
    : '';
});
const page = computed(() => {
  const raw = route.query.page;
  const value = typeof raw === 'string' && /^[1-9]\d*$/.test(raw) ? Number(raw) : 1;
  return Number.isSafeInteger(value) ? value : 1;
});

const drawerOpen = ref(false);
const submitting = ref(false);

const query = computed(() => {
  const params = new URLSearchParams({ page: String(page.value), pageSize: '25' });
  if (status.value) params.set('status', status.value);
  return `/api/v1/scans?${params.toString()}`;
});

const scansRequest = await useFetch<{ data: import('~~/shared/scan').ScanListPage }>(
  () => query.value,
);
const reposRequest = await useFetch<{ data: { items: SavedRepoView[] } }>('/api/v1/repos');
const items = computed(() => scansRequest.data.value?.data.items ?? []);
const pagination = computed(
  () =>
    scansRequest.data.value?.data.pagination ?? {
      page: 1,
      pageSize: 25,
      totalItems: 0,
      totalPages: 1,
    },
);
const repos = computed(() => reposRequest.data.value?.data.items ?? []);
const summaryRequest = await useFetch<{ data: OrgSummary }>('/api/v1/org/summary');
const quota = computed<ScanQuota | null>(() => {
  const summary = summaryRequest.data.value?.data;
  return summary ? { used: summary.scansUsedThisMonth, limit: summary.scansPerMonth ?? 0 } : null;
});

// Bookmarked pages can become empty after scans expire or a filter changes.
// Reconcile only successful metadata so a failed request cannot change the URL.
watch(
  [
    page,
    () => scansRequest.data.value?.data.pagination,
    () => scansRequest.status.value === 'pending',
  ],
  ([currentPage, metadata, isLoading]) => {
    if (isLoading || scansRequest.error.value || metadata === undefined) return;
    const lastPage = Math.max(1, metadata.totalPages);
    if (currentPage > lastPage) {
      void router.replace({
        query: { ...route.query, page: lastPage === 1 ? undefined : String(lastPage) },
      });
    }
  },
  { immediate: true },
);

// Status chips and scores must move as scans progress, so re-fetch the current
// page while the tab is visible; the timer is cleared on route change.
let refreshTimer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  // Overview's "+ New scan" links here with ?new=1; open the drawer once, then
  // drop the marker so a refresh does not reopen it.
  if (route.query.new === '1') {
    drawerOpen.value = true;
    const { new: _marker, ...rest } = route.query;
    void router.replace({ query: rest });
  }
  refreshTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    void scansRequest.refresh();
  }, 5000);
});
onBeforeUnmount(() => {
  if (refreshTimer !== undefined) clearInterval(refreshTimer);
});

function setStatus(value: ScanStatus | ''): void {
  void router.push({ query: { ...route.query, status: value || undefined, page: undefined } });
}

async function startScan(payload: {
  repositoryId?: string;
  githubUrl?: string;
  ref?: string;
  profile: ScanProfile;
  idempotencyKey: string;
}): Promise<void> {
  submitting.value = true;
  try {
    const { idempotencyKey, ...body } = payload;
    const response = await $fetch<{ data: { id: string } }>(scanSubmitPath(), {
      method: 'POST',
      body,
      headers: { 'idempotency-key': idempotencyKey },
    });
    drawerOpen.value = false;
    push('success', 'Scan queued', 'The scan is now running.');
    await navigateTo(`/app/scans/${response.data.id}`);
  } catch (cause) {
    push(
      'error',
      'Scan could not be started',
      apiErrorMessage(cause, 'Check the repository URL and try again.'),
    );
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="min-w-0">
    <DashboardPageHeader
      title="Scans"
      subtitle="Run a scan, then trace every finding back to evidence."
    >
      <template #actions>
        <button
          v-if="canSubmit"
          type="button"
          data-action="open-new-scan"
          class="bg-brand-500 text-ink-50 rounded-[var(--radius-control)] px-4 py-2 text-sm font-medium"
          @click="drawerOpen = true"
        >
          + New scan
        </button>
      </template>
    </DashboardPageHeader>

    <DsErrorState
      v-if="scansRequest.error.value"
      message="Scans could not be loaded."
      @retry="scansRequest.refresh"
    />

    <ScanTable
      :can-submit="canSubmit"
      :scans="items"
      :pagination="pagination"
      :status="status"
      :loading="scansRequest.status.value === 'pending'"
      @update:status="setStatus"
      @update:page="
        router.push({ query: { ...route.query, page: $event === 1 ? undefined : String($event) } })
      "
      @new-scan="drawerOpen = true"
    />

    <StartScanDrawer
      :open="drawerOpen"
      :repos="repos"
      :quota="quota"
      :submitting="submitting"
      @close="drawerOpen = false"
      @submit="startScan"
    />
  </div>
</template>
