<script setup lang="ts">
import { computed } from 'vue';

import { formatTimestamp, scanEventDetail, scanEventLabel, type ScanEvent } from '~~/shared/scan';
import AppIcon from '../ui/AppIcon.vue';

/** Timeline rows come straight from `GET /api/v1/scan/:scanId/events` (api.md §3.5). */
const props = withDefaults(defineProps<{ events: ScanEvent[]; isLoading?: boolean }>(), {
  isLoading: false,
});

const rows = computed(() =>
  props.events.map((event) => ({
    label: scanEventLabel(event.type),
    detail: scanEventDetail(event),
    at: formatTimestamp(event.at),
  })),
);
</script>

<template>
  <section
    aria-labelledby="timeline-heading"
    class="bg-surface rounded-[var(--radius-card)] p-5 shadow-[var(--shadow-card)]"
  >
    <h2 id="timeline-heading" class="text-ink-400 font-mono text-xs tracking-widest uppercase">
      Timeline
    </h2>

    <div v-if="isLoading" aria-busy="true" class="mt-4 space-y-3">
      <div
        v-for="index in 4"
        :key="index"
        class="bg-ink-200 h-3 w-3/4 rounded-[var(--radius-control)]"
      />
      <p class="sr-only" role="status">Loading scan events</p>
    </div>

    <div v-else-if="rows.length === 0" class="text-ink-500 mt-4 flex items-start gap-2 text-sm">
      <AppIcon name="info" :size="16" class="mt-0.5" />
      <div>
        <p class="text-ink-800 font-medium">No events yet</p>
        <p class="mt-1">Lifecycle events appear here as the scan progresses.</p>
      </div>
    </div>

    <ol v-else aria-label="Scan timeline" class="mt-4 space-y-0">
      <li
        v-for="(row, index) in rows"
        :key="`${row.at}-${index}`"
        class="border-ink-200 relative flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-l py-2 pl-4"
      >
        <span
          class="bg-ink-300 absolute top-3 -left-1 h-1.5 w-1.5 rounded-full"
          aria-hidden="true"
        />
        <div class="min-w-0">
          <p class="text-ink-800 text-sm font-medium">{{ row.label }}</p>
          <p v-if="row.detail" class="text-ink-600 mt-0.5 text-xs">{{ row.detail }}</p>
        </div>
        <time class="text-ink-500 font-mono text-xs tabular-nums">{{ row.at }}</time>
      </li>
    </ol>
  </section>
</template>
