<script setup lang="ts">
import PageHeader from '~/components/shell/PageHeader.vue';

definePageMeta({ layout: 'app' });
</script>

<template>
  <PageHeader title="Organisation settings" />
  <p class="text-ink-600 mt-4 text-sm">
    Organisation settings control access, retention, and scan limits.
  </p>
</template>
