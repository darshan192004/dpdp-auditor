<script setup lang="ts">
import { computed, ref } from 'vue';

import DsErrorState from '~/components/ds/DsErrorState.vue';
import NewFindings from '~/components/new/NewFindings.vue';
import { useAppContext } from '~/composables/useAppContext';
import { useFindingsQuery } from '~/composables/useFindingsQuery';
import { useToasts } from '~/composables/useToasts';
import { apiErrorMessage } from '~~/shared/api-error';
import type { FindingStatus, FindingsPage } from '~~/shared/findings';
import { serialiseFindingsQuery } from '~~/shared/findings-query';

const route = useRoute();
const scanId = computed(() => String(route.params.scanId));

const { org } = useAppContext();
const { push } = useToasts();
const { filters, update, clear } = useFindingsQuery();
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

const findings = computed(() => data.value?.data ?? []);
const pagination = computed(
  () =>
    data.value?.pagination ?? {
      page: filters.value.page,
      pageSize: filters.value.pageSize,
      totalItems: 0,
      totalPages: 1,
    },
);

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
const selected = computed(() => findings.value.find((f) => f.id === selectedId.value) ?? null);
const triaging = ref(false);

async function onTriage(draft: {
  status: FindingStatus;
  note?: string;
  externalUrl?: string;
}): Promise<void> {
  if (selectedId.value === null) return;

  triaging.value = true;
  try {
    await $fetch(`/api/v1/findings/${selectedId.value}`, { method: 'PATCH', body: draft });
    push('success', 'Disposition saved', `Status: ${draft.status}.`);
    selectedId.value = null;
    await refresh();
  } catch (cause) {
    push(
      'error',
      'Disposition not saved',
      apiErrorMessage(cause, 'The finding could not be updated. Try again.'),
    );
  } finally {
    triaging.value = false;
  }
}
</script>

<template>
  <div>
    <DsErrorState
      v-if="loadError"
      :message="loadError.message"
      :request-id="loadError.requestId ?? ''"
      @retry="refresh"
    />
    <NewFindings
      v-else
      :findings="findings"
      :pagination="pagination"
      :filters="filters"
      :sort="filters.sort"
      :role="role"
      :selected="selected"
      :loading="status === 'pending'"
      :triaging="triaging"
      @select="selectedId = $event.id"
      @close="selectedId = null"
      @update:filters="update"
      @clear="clear"
      @update:sort="update({ sort: $event })"
      @update:page="update({ page: $event })"
      @update:page-size="update({ pageSize: $event })"
      @triage="onTriage"
    />
  </div>
</template>
