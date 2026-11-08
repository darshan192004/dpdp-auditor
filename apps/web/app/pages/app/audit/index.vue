<script setup lang="ts">
import PageHeader from '~/components/shell/PageHeader.vue';

definePageMeta({ layout: 'app' });
</script>

<template>
  <PageHeader title="Audit" />
  <p class="text-ink-600 mt-4 text-sm">
    Audit entries record who changed a finding or a rule, and when.
  </p>
</template>
