<script setup lang="ts">
import { computed } from 'vue';

import NewAudit from '~/components/new/NewAudit.vue';
import type { AuditLogListResponse } from '~~/shared/audit';

const { data, status, error } = await useFetch<AuditLogListResponse>(
  '/api/v1/audit-logs?page=1&pageSize=50',
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
  <NewAudit :events="entries" :loading="loading" :error="loadError" />
</template>
