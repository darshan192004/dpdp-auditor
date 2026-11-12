<script setup lang="ts">
import { computed } from 'vue';

import PageHeader from '~/components/shell/PageHeader.vue';

definePageMeta({ layout: 'app' });

const route = useRoute();
const scanId = computed(() => String(route.params.scanId));
const shortId = computed(() => scanId.value.slice(0, 8));
</script>

<template>
  <div class="space-y-6">
    <PageHeader
      title="Scan"
      :breadcrumbs="[{ label: 'Scans', to: '/app/scans' }, { label: shortId }]"
    />

    <p class="text-ink-600 font-mono text-xs">{{ scanId }}</p>

    <div class="flex flex-wrap gap-2">
      <NuxtLink
        :to="`/app/scans/${scanId}/findings`"
        class="bg-brand-700 hover:bg-brand-900 focus-visible:ring-brand-500 inline-flex items-center rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium text-white focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        View findings
      </NuxtLink>
    </div>
  </div>
</template>
