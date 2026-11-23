<script setup lang="ts">
import { computed } from 'vue';

import { planLabel, type OrgSummary } from '~~/shared/org';

const props = withDefaults(defineProps<{ summary?: OrgSummary | null }>(), { summary: null });

const plan = computed(() => planLabel(props.summary?.plan));

const scansPercent = computed(() => {
  const summary = props.summary;
  if (!summary || summary.scansPerMonth === null || summary.scansPerMonth === 0) return 0;
  return Math.min(100, Math.round((summary.scansUsedThisMonth / summary.scansPerMonth) * 100));
});

const reportsPercent = computed(() => {
  const summary = props.summary;
  if (!summary || summary.reportsPerMonth === null || summary.reportsPerMonth === 0) return 0;
  return Math.min(100, Math.round((summary.reportsUsedThisMonth / summary.reportsPerMonth) * 100));
});

const scansAria = computed(() => {
  const summary = props.summary;
  return `Scans this month: ${summary?.scansUsedThisMonth ?? 0} of ${summary ? (summary.scansPerMonth ?? 'unlimited') : 'unknown'}`;
});

const reportsAria = computed(() => {
  const summary = props.summary;
  return `Reports this month: ${summary?.reportsUsedThisMonth ?? 0} of ${summary ? (summary.reportsPerMonth ?? 'unlimited') : 'unknown'}`;
});
</script>

<template>
  <GlassCard elevation="surface" padding="lg">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="text-ink-400 font-mono text-xs tracking-widest uppercase">Plan</p>
        <p class="text-ink-900 mt-1 text-sm font-semibold">{{ plan }}</p>
      </div>
    </div>

    <div class="mt-6 space-y-5">
      <div>
        <div class="mb-2 flex items-baseline justify-between gap-2">
          <p class="text-ink-500 text-xs font-medium">Scans this month</p>
          <p class="text-ink-900 font-mono tabular-nums">
            {{ summary?.scansUsedThisMonth ?? '—' }} /
            {{ summary ? (summary.scansPerMonth ?? 'Unlimited') : '—' }}
          </p>
        </div>
        <div class="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <span
            class="bg-brand-600 block h-full"
            :style="{ width: scansPercent + '%' }"
            :aria-label="scansAria"
            role="progressbar"
            :aria-valuenow="scansPercent"
            aria-valuemin="0"
            aria-valuemax="100"
          />
        </div>
      </div>

      <div>
        <div class="mb-2 flex items-baseline justify-between gap-2">
          <p class="text-ink-500 text-xs font-medium">Reports this month</p>
          <p class="text-ink-900 font-mono tabular-nums">
            {{ summary?.reportsUsedThisMonth ?? '—' }} /
            {{ summary ? (summary.reportsPerMonth ?? 'Unlimited') : '—' }}
          </p>
        </div>
        <div class="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <span
            class="bg-brand-600 block h-full"
            :style="{ width: reportsPercent + '%' }"
            :aria-label="reportsAria"
            role="progressbar"
            :aria-valuenow="reportsPercent"
            aria-valuemin="0"
            aria-valuemax="100"
          />
        </div>
      </div>
    </div>
  </GlassCard>
</template>
