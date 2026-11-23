<script setup lang="ts">
import { computed } from 'vue';

import DashboardPageHeader from '~/components/dashboard/DashboardPageHeader.vue';
import SeverityBar from '~/components/dashboard/SeverityBar.vue';
import FindingDrawer from '~/components/findings/FindingDrawer.vue';
import FindingsFilterBar from '~/components/findings/FindingsFilterBar.vue';
import FindingsTable from '~/components/findings/FindingsTable.vue';
import DsSkeleton from '~/components/ds/DsSkeleton.vue';
import type {
  FindingSort,
  FindingStatus,
  FindingView,
  FindingsFilters,
  FindingsPagination,
} from '~~/shared/findings';

// The four core props (findings, pagination, selected, loading) are the
// presentational contract; filters/sort/role/triaging let the page delegate
// the workbench controls while owning all state and mutations.
const props = withDefaults(
  defineProps<{
    findings: FindingView[];
    pagination: FindingsPagination;
    selected: FindingView | null;
    filters: FindingsFilters;
    sort: FindingSort;
    role: string;
    loading?: boolean;
    triaging?: boolean;
  }>(),
  { loading: false, triaging: false },
);

const emit = defineEmits<{
  select: [finding: FindingView];
  close: [];
  triage: [draft: { status: FindingStatus; note?: string; externalUrl?: string }];
  'update:filters': [patch: Partial<FindingsFilters>];
  clear: [];
  'update:sort': [sort: FindingSort];
  'update:page': [page: number];
  'update:pageSize': [pageSize: number];
}>();

const counts = computed(() => ({
  critical: props.findings.filter((finding) => finding.severity === 'critical').length,
  high: props.findings.filter((finding) => finding.severity === 'high').length,
  medium: props.findings.filter((finding) => finding.severity === 'medium').length,
  low: props.findings.filter((finding) => finding.severity === 'low').length,
  info: props.findings.filter((finding) => finding.severity === 'info').length,
  total: props.findings.length,
}));
</script>

<template>
  <div class="min-w-0">
    <DashboardPageHeader
      title="Findings"
      subtitle="Every finding carries evidence, a DPDP mapping and a fix."
    >
      <template #actions>
        <span class="text-ink-400 font-mono text-xs">{{ pagination.totalItems }} total</span>
      </template>
    </DashboardPageHeader>

    <div class="bg-surface rounded-[var(--radius-card)] p-4 shadow-[var(--shadow-card)]">
      <SeverityBar :counts="counts" />
      <p v-if="selected" class="text-ink-400 mt-2 font-mono text-xs">
        Selected evidence · {{ selected.evidence.hash }}
      </p>
    </div>

    <FindingsFilterBar
      :filters="filters"
      :total-items="pagination.totalItems"
      class="mt-4"
      @update="emit('update:filters', $event)"
      @clear="emit('clear')"
    />

    <DsSkeleton v-if="loading" class="mt-4 h-64" />
    <FindingsTable
      v-else
      :findings="findings"
      :pagination="pagination"
      :sort="sort"
      :selected-id="selected?.id ?? null"
      @select="emit('select', $event)"
      @update:sort="emit('update:sort', $event)"
      @update:page="emit('update:page', $event)"
      @update:page-size="emit('update:pageSize', $event)"
      @clear="emit('clear')"
    />

    <FindingDrawer
      :finding="selected"
      :open="selected !== null"
      :role="role"
      :submitting="triaging"
      @update:open="!$event && emit('close')"
      @triage="emit('triage', $event)"
    />
  </div>
</template>
