<script setup lang="ts">
import PageHeader from '~/components/shell/PageHeader.vue';
import EmptyState from '~/components/ui/EmptyState.vue';

definePageMeta({ layout: 'app' });
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Scans" :breadcrumbs="[{ label: 'Scans' }]" />
    <EmptyState
      title="No scans yet"
      description="Scans run against the default branch and record the evidence behind each finding. Connect a repository to start one."
      icon="search"
    />
  </div>
</template>
