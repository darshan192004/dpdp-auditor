<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import NewAudit from '~/components/new/NewAudit.vue';
import type { AuditLogListResponse } from '~~/shared/audit';

const page = ref(1);
const action = ref('');
watch(action, () => {
  page.value = 1;
});
const { data, status, error } = await useFetch<AuditLogListResponse>(
  () =>
    `/api/v1/audit-logs?page=${page.value}&pageSize=50&action=${encodeURIComponent(action.value.trim())}`,
);

const entries = computed(() => data.value?.data ?? []);
const loading = computed(() => status.value === 'pending');
const loadError = computed(() => {
  if (!error.value) return null;
  const failure = error.value as {
    data?: { error?: { message?: string; requestId?: string } };
  };
  const message = failure.data?.error?.message ?? 'The audit log could not be loaded.';
  const requestId = failure.data?.error?.requestId;
  return requestId ? `${message} (request ${requestId})` : message;
});
</script>

<template>
  <div>
    <NewAudit
      :events="entries"
      :loading="loading"
      :error="loadError"
      @update:action="action = $event"
    />
    <nav v-if="(data?.pagination.totalPages ?? 0) > 1" aria-label="Pagination">
      <button :disabled="page <= 1 || loading" @click="page--">Previous</button>
      <span>Page {{ page }} of {{ data?.pagination.totalPages }}</span>
      <button :disabled="page >= (data?.pagination.totalPages ?? 1) || loading" @click="page++">
        Next
      </button>
    </nav>
  </div>
</template>
