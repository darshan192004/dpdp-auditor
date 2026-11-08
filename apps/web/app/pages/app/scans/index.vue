<script setup lang="ts">
import PageHeader from '~/components/shell/PageHeader.vue';

definePageMeta({ layout: 'app' });
</script>

<template>
  <PageHeader title="Scans" />
  <p class="text-ink-600 mt-4 text-sm">
    Scans run against the default branch and record the evidence behind each finding.
  </p>
</template>
