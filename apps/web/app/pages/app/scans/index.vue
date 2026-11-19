<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import ScanTable from '~/components/dashboard/ScanTable.vue';
import StartScanDrawer from '~/components/dashboard/StartScanDrawer.vue';
import DsErrorState from '~/components/ds/DsErrorState.vue';
import DashboardPageHeader from '~/components/dashboard/DashboardPageHeader.vue';
import { useAppContext } from '~/composables/useAppContext';
import { useToasts } from '~/composables/useToasts';
import { apiErrorMessage } from '~~/shared/api-error';
import type { SavedRepoView } from '~~/shared/repo';
import { canManageScans, scanSubmitPath, type ScanProfile, type ScanStatus } from '~~/shared/scan';

const route = useRoute();
const router = useRouter();
const { org } = useAppContext();
const { push } = useToasts();
const canSubmit = computed(() => canManageScans(org.value?.role ?? null));

const status = ref<ScanStatus | ''>('');
const page = ref(1);
const drawerOpen = ref(false);
const submitting = ref(false);

const query = computed(() => {
  const params = new URLSearchParams({ page: String(page.value), pageSize: '25' });
  if (status.value) params.set('status', status.value);
  return `/api/v1/scans?${params.toString()}`;
});

const scansRequest = await useFetch<{ data: import('~~/shared/scan').ScanListPage }>(query);
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
const quota = ref<{ used: number; limit: number } | null>(null);

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
  status.value = value;
  page.value = 1;
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
    const response = await $fetch<{ data: { id: string } }>(scanSubmitPath(), {
      method: 'POST',
      body: payload,
      headers: { 'idempotency-key': payload.idempotencyKey },
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
      :scans="items"
      :pagination="pagination"
      :status="status"
      :loading="scansRequest.status.value === 'pending'"
      @update:status="setStatus"
      @update:page="page = $event"
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
