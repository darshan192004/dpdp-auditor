<script setup lang="ts">
import DsBadge from '~/components/ds/DsBadge.vue';
import DsCard from '~/components/ds/DsCard.vue';
import type { FindingSeverity } from '~~/shared/findings';

defineProps<{
  score: number | null;
  grade: string | null;
  coverage: string;
  sections: { code: string; title: string; score: number | null }[];
  findings: { id: string; severity: FindingSeverity; message: string }[];
  coverageNote?: string | null;
}>();
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold">Score and coverage</h1>
    <DsCard class="mt-6">
      <div class="flex items-end gap-4">
        <span class="text-ink-900 text-4xl leading-none font-semibold tabular-nums">
          {{ score === null ? '—' : score.toFixed(1) }}
        </span>
        <DsBadge :tone="coverage === 'full' ? 'low' : 'medium'">{{ grade ?? '-' }}</DsBadge>
        <span class="text-ink-400 font-mono text-xs">coverage: {{ coverage }}</span>
      </div>
      <p v-if="coverageNote" class="text-risk-medium-text mt-3 text-sm">{{ coverageNote }}</p>
    </DsCard>
    <h2 class="mt-8 text-xl font-semibold">Section scores</h2>
    <div class="mt-3 grid gap-2">
      <DsCard v-for="section in sections" :key="section.code">
        <div class="flex justify-between gap-4">
          <span class="font-mono text-xs">{{ section.code }} · {{ section.title }}</span>
          <span class="tabular-nums">{{
            section.score === null ? '—' : section.score.toFixed(1)
          }}</span>
        </div>
      </DsCard>
      <p v-if="sections.length === 0" class="text-ink-400 text-sm">No section scores yet.</p>
    </div>
    <h2 class="mt-8 text-xl font-semibold">Contributing findings</h2>
    <div class="mt-3 grid gap-2">
      <DsCard v-for="finding in findings" :key="finding.id">
        <DsBadge :tone="finding.severity">{{ finding.severity }}</DsBadge>
        <span class="ml-3 text-sm">{{ finding.message }}</span>
      </DsCard>
      <p v-if="findings.length === 0" class="text-ink-400 text-sm">
        No findings contributed to this score.
      </p>
    </div>
  </div>
</template>
