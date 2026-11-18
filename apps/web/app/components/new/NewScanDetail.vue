<script setup lang="ts">
import DsBadge from '~/components/ds/DsBadge.vue';
import DsCard from '~/components/ds/DsCard.vue';
import DsSkeleton from '~/components/ds/DsSkeleton.vue';
import DsScoreCard from '~/components/ds/DsScoreCard.vue';

interface ScanView {
  id: string;
  status: string;
  score: number | null;
  grade: string | null;
  coverage: string;
  repository: string;
  note?: string | null;
}

defineProps<{ scan: ScanView | null; loading?: boolean }>();
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold">{{ scan?.repository ?? 'Scan' }}</h1>
    <DsSkeleton v-if="loading || scan === null" class="mt-6 h-32" />
    <template v-else>
      <DsScoreCard
        class="mt-6"
        :score="scan.score"
        :grade="scan.grade"
        :coverage="scan.coverage"
        :findings-href="`/app/scans/${scan.id}/findings`"
      />
      <DsCard class="mt-4">
        <div class="flex flex-wrap items-center gap-3">
          <DsBadge tone="info">{{ scan.status }}</DsBadge>
          <NuxtLink
            :to="`/app/scans/${scan.id}/coverage`"
            class="text-brand-500 font-mono text-xs hover:underline"
          >
            Score and coverage breakdown
          </NuxtLink>
          <NuxtLink
            :to="`/app/scans/${scan.id}/remediation`"
            class="text-brand-500 font-mono text-xs hover:underline"
          >
            Remediation workspace
          </NuxtLink>
        </div>
        <p v-if="scan.note" class="text-risk-medium-text mt-3 text-sm">{{ scan.note }}</p>
      </DsCard>
    </template>
  </div>
</template>
