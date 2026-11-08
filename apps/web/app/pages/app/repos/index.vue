<script setup lang="ts">
import PageHeader from '~/components/shell/PageHeader.vue';

definePageMeta({ layout: 'app' });
</script>

<template>
  <PageHeader title="Repositories" />
  <p class="text-ink-600 mt-4 text-sm">
    Repositories you connect appear here, with their latest score.
  </p>
</template>
