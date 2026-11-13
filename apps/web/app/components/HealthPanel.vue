<script setup lang="ts">
import type { HealthStatus } from '~/types/health';
import { formatHealth } from '~/utils/formatHealth';

const props = defineProps<{
  health: HealthStatus | null;
  pending: boolean;
}>();

const view = computed(() => (props.health ? formatHealth(props.health) : null));
</script>

<template>
  <!-- Loading: skeleton shaped like the resolved layout, aria-busy, no spinner (design §8). -->
  <div v-if="pending" role="status" aria-busy="true" class="space-y-6">
    <span class="sr-only">Loading system status</span>
    <div class="bg-ink-200 h-7 w-44 rounded-[var(--radius-card)]" aria-hidden="true" />
    <div class="bg-ink-200 h-4 w-72 rounded-[var(--radius-card)]" aria-hidden="true" />
    <div class="bg-ink-100 h-32 w-full rounded-[var(--radius-card)]" aria-hidden="true" />
  </div>

  <div v-else-if="view" class="space-y-6">
    <div>
      <h1 class="text-ink-900 text-2xl font-semibold">{{ view.title }}</h1>
      <p class="text-ink-600 mt-2 text-base leading-6">{{ view.summary }}</p>
    </div>

    <dl
      class="divide-ink-200 bg-surface divide-y rounded-[var(--radius-card)] shadow-[var(--shadow-card)]"
    >
      <div class="flex items-center justify-between gap-4 px-4 py-3">
        <dt class="text-ink-500 text-sm">Version</dt>
        <dd class="text-ink-800 font-mono text-xs">{{ view.version }}</dd>
      </div>
      <div class="flex items-center justify-between gap-4 px-4 py-3">
        <dt class="text-ink-500 text-sm">Uptime</dt>
        <dd class="text-ink-800 font-mono text-xs">{{ view.uptime }}</dd>
      </div>
    </dl>
  </div>

  <!-- Error: says what happened and what to do (design §8, §13). -->
  <div v-else class="space-y-4" role="alert">
    <h1 class="text-ink-900 text-2xl font-semibold">System status</h1>
    <p class="text-ink-600 text-base leading-6">
      Status could not be loaded. Refresh the page to try again.
    </p>
  </div>
</template>
