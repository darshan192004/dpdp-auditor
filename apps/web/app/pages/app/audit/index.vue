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
  const failure = error.value as { data?: { error?: { message?: string } } } | null;
  return failure?.data?.error?.message ?? null;
});
</script>

<template>
  <NewAudit
    :events="
      entries.map((entry) => ({
        id: String(entry.id),
        action: entry.action,
        createdAt: entry.createdAt,
      }))
    "
    :loading="loading"
    :error="loadError"
  />
</template>
