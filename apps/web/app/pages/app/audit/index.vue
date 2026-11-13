<script setup lang="ts">
import PageHeader from '~/components/shell/PageHeader.vue';
import EmptyState from '~/components/ui/EmptyState.vue';

definePageMeta({ layout: 'app' });
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Audit" :breadcrumbs="[{ label: 'Audit' }]" />
    <EmptyState
      title="No audit entries yet"
      description="Audit entries record who changed a finding or a rule, and when. The trail starts with the first triage decision."
      icon="clipboard-check"
    />
  </div>
</template>
