<script setup lang="ts">
import PageHeader from '~/components/shell/PageHeader.vue';
import EmptyState from '~/components/ui/EmptyState.vue';

definePageMeta({ layout: 'app' });
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Repositories" :breadcrumbs="[{ label: 'Repositories' }]" />
    <EmptyState
      title="No repositories connected"
      description="Repositories you connect appear here, with their latest score. Scanning reads the default branch only."
      icon="cloud"
    />
  </div>
</template>
