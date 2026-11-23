<script setup lang="ts">
import { computed } from 'vue';

import DashboardPageHeader from '~/components/dashboard/DashboardPageHeader.vue';
import StatusChip from '~/components/dashboard/StatusChip.vue';
import DsEmptyState from '~/components/ds/DsEmptyState.vue';
import type { ScanSummary } from '~~/shared/scan';

const props = withDefaults(
  defineProps<{
    scans: ScanSummary[];
    loading?: boolean;
    error?: string | null;
  }>(),
  { loading: false, error: null },
);

const completed = computed(() => props.scans.filter((scan) => scan.status === 'completed'));
</script>

<template>
  <div class="min-w-0">
    <DashboardPageHeader
      title="Remediation"
      subtitle="Choose a completed scan to triage its findings."
    />
    <DsEmptyState
      v-if="!loading && !error && completed.length === 0"
      title="No completed scans to triage"
      class="mt-6"
    />
    <p v-else-if="loading" role="status" class="text-ink-400 mt-6 text-sm">Loading scans…</p>
    <p v-else-if="error" role="alert" class="text-risk-critical-text mt-6 text-sm">{{ error }}</p>
    <div v-else class="mt-6 grid gap-3 xl:grid-cols-2">
      <NuxtLink
        v-for="scan in completed"
        :key="scan.id"
        :to="`/app/scans/${scan.id}/remediation`"
        class="bg-surface hover:border-brand-500 focus-visible:ring-brand-500 border-ink-200 rounded-[var(--radius-card)] border p-4 transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <span class="flex items-start justify-between gap-3">
          <span class="text-sm font-medium">{{ scan.repositoryFullName }}</span>
          <StatusChip :status="scan.status" />
        </span>
        <span class="text-ink-400 mt-3 block font-mono text-xs tabular-nums">
          {{ scan.counts.total }} findings · {{ scan.grade ?? 'no grade' }}
        </span>
      </NuxtLink>
    </div>
  </div>
</template>
