<script setup lang="ts">
import { computed, ref } from 'vue';

import DsDrawer from '~/components/ds/DsDrawer.vue';
import DsFilterChips from '~/components/ds/DsFilterChips.vue';
import DsFindingRow from '~/components/ds/DsFindingRow.vue';
import type { FindingSeverity, FindingView } from '~~/shared/findings';

const props = defineProps<{ findings: FindingView[] }>();
const route = useRoute();

const SEVERITIES: FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
const active = ref<FindingSeverity[]>([]);
const selected = ref<FindingView | null>(null);

const visible = computed(() =>
  active.value.length === 0
    ? props.findings
    : props.findings.filter((finding) => active.value.includes(finding.severity)),
);
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold">Findings</h1>
    <DsFilterChips v-model="active" :options="SEVERITIES" class="mt-4" />
    <div class="mt-4 grid gap-2">
      <div
        v-for="(finding, index) in visible.slice(0, 20)"
        :key="finding.id"
        :style="{ transitionDelay: `${Math.min(index, 19) * 20}ms` }"
        class="min-w-0 transition-[transform,opacity] duration-[var(--motion-base)] ease-[var(--ease-out)]"
      >
        <DsFindingRow :finding="finding" @select="selected = $event" />
      </div>
      <p v-if="visible.length === 0" class="text-ink-400 mt-4 text-sm">
        No findings match these filters.
      </p>
    </div>
    <DsDrawer :open="selected !== null" :title="selected?.message ?? ''" @close="selected = null">
      <template v-if="selected">
        <p class="text-ink-400 font-mono text-xs">
          {{ selected.severity }} · {{ selected.evidence.hash }}
        </p>
        <p class="mt-4 text-sm">{{ selected.remediation?.summary ?? 'Review this finding.' }}</p>
        <NuxtLink
          :to="`/app/scans/${route.params.scanId}/remediation?finding=${selected.id}`"
          class="text-brand-500 mt-6 inline-block font-mono text-xs hover:underline"
        >
          Open remediation workspace
        </NuxtLink>
      </template>
    </DsDrawer>
  </div>
</template>
