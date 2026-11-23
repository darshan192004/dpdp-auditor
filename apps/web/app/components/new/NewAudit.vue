<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import DashboardPageHeader from '~/components/dashboard/DashboardPageHeader.vue';
import DsEmptyState from '~/components/ds/DsEmptyState.vue';
import type { AuditLogEntry } from '~~/shared/audit';
import { formatTimestamp } from '~~/shared/scan';

const props = withDefaults(
  defineProps<{
    events: AuditLogEntry[];
    loading?: boolean;
    error?: string | null;
  }>(),
  { loading: false, error: null },
);

const emit = defineEmits<{ 'update:action': [action: string] }>();
const action = ref('');
watch(action, (value) => emit('update:action', value));
const visible = computed(() => {
  const needle = action.value.trim().toLowerCase();
  return needle === ''
    ? props.events
    : props.events.filter((event) => event.action.toLowerCase().includes(needle));
});
</script>

<template>
  <div class="min-w-0">
    <DashboardPageHeader title="Audit" subtitle="Every action, with actor and resource." />
    <div class="bg-surface border-ink-200 mt-6 rounded-[var(--radius-card)] border p-4">
      <label for="audit-action" class="text-ink-500 mb-1.5 block text-xs font-medium">
        Filter by action
      </label>
      <input
        id="audit-action"
        v-model="action"
        data-audit-action
        type="search"
        aria-label="Filter audit events by action"
        placeholder="e.g. scan.created"
        class="bg-surface-raised text-ink-900 border-ink-300 w-full rounded-[var(--radius-control)] px-3 py-2 text-sm sm:max-w-xs"
      />
    </div>
    <DsEmptyState
      v-if="!loading && !error && visible.length === 0"
      title="No audit events"
      class="mt-6"
    />
    <p v-else-if="loading" role="status" class="text-ink-400 mt-6 text-sm">Loading audit log…</p>
    <p v-else-if="error" role="alert" class="text-risk-critical-text mt-6 text-sm">{{ error }}</p>
    <div v-else class="border-ink-200 mt-4 overflow-x-auto rounded-[var(--radius-card)] border">
      <table class="w-full min-w-[640px] text-left text-sm">
        <caption class="sr-only">
          Audit log events
        </caption>
        <thead class="bg-ink-100 text-ink-400 font-mono text-[11px] tracking-wider uppercase">
          <tr>
            <th scope="col" class="px-3 py-2">When</th>
            <th scope="col" class="px-3 py-2">Actor</th>
            <th scope="col" class="px-3 py-2">Action</th>
            <th scope="col" class="px-3 py-2">Resource</th>
          </tr>
        </thead>
        <tbody class="divide-ink-200 divide-y">
          <tr v-for="event in visible" :key="event.id" class="hover:bg-ink-100">
            <td class="text-ink-400 px-3 py-2 font-mono text-xs tabular-nums">
              {{ formatTimestamp(event.createdAt) }}
            </td>
            <td class="px-3 py-2">{{ event.actor.name ?? event.actor.id ?? event.actor.type }}</td>
            <td class="px-3 py-2 font-mono text-xs">{{ event.action }}</td>
            <td class="px-3 py-2 font-mono text-xs">
              {{ event.resource.type }}{{ event.resource.id ? `:${event.resource.id}` : '' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
