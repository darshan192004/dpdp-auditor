<script setup lang="ts">
import { computed, ref } from 'vue';

import PageHeader from '~/components/shell/PageHeader.vue';
import EmptyState from '~/components/ui/EmptyState.vue';
import ErrorState from '~/components/ui/ErrorState.vue';
import ScanSubmitForm from '~/components/scan/ScanSubmitForm.vue';
import { useAppContext } from '~/composables/useAppContext';
import { canManageScans, scanSubmitPath, type ScanQuota } from '~~/shared/scan';
import type { SavedRepoView } from '~~/shared/repo';

definePageMeta({ layout: 'app' });

const { org } = useAppContext();
const canSubmit = computed(() => canManageScans(org.value?.role ?? null));

const reposRequest = await useFetch<{ data: { items: SavedRepoView[] } }>('/api/v1/repos');
const repos = computed(() => reposRequest.data.value?.data.items ?? []);
const loading = computed(() => reposRequest.status.value === 'pending');
const quota = ref<ScanQuota | null>(null);

const loadError = computed(() => {
  const failure = reposRequest.error.value as {
    data?: { error?: { message?: string; requestId?: string } };
  } | null;
  if (!failure) return null;
  return {
    message: failure.data?.error?.message ?? 'Scans could not be loaded.',
    requestId: failure.data?.error?.requestId,
  };
});

function messageFrom(cause: unknown): string {
  const message = (cause as { data?: { error?: { message?: unknown } } }).data?.error?.message;
  return typeof message === 'string' ? message : 'Something went wrong. Try again.';
}

async function submitScan(payload: {
  repositoryId?: string;
  githubUrl?: string;
  ref?: string;
  profile: 'standard' | 'secrets-only';
  idempotencyKey: string;
}): Promise<void> {
  try {
    const response = await $fetch<{ data: { id: string } }>(scanSubmitPath(), {
      method: 'POST',
      body: payload,
      headers: { 'idempotency-key': payload.idempotencyKey },
    });
    await navigateTo(`/app/scans/${response.data.id}`);
  } catch (cause) {
    throw new Error(messageFrom(cause), { cause });
  }
}
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Scans" :breadcrumbs="[{ label: 'Scans' }]" />

    <ScanSubmitForm v-if="canSubmit" :repos="repos" :quota="quota" @submit="submitScan" />

    <ErrorState
      v-if="loadError"
      :message="loadError.message"
      :request-id="loadError.requestId ?? null"
      @retry="reposRequest.refresh"
    />

    <template v-else>
      <p v-if="loading && repos.length === 0" role="status" class="text-ink-500 text-sm">
        Loading repositories…
      </p>

      <EmptyState
        v-else-if="repos.length === 0"
        title="No repositories yet"
        description="Connect a repository to start one. Scans run against the default branch and record the evidence behind each finding."
        icon="search"
      />
    </template>
  </div>
</template>
