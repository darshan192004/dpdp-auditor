<script setup lang="ts">
const route = useRoute();
const scanId = String(route.params.scanId);
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-ink-900 text-2xl font-semibold">Exports</h1>
    <p class="text-ink-500 text-sm">Machine-readable and issue-ready views of control results.</p>
    <ul class="space-y-2">
      <li><a :href="`/api/v1/scan/${scanId}/export/sarif`">Download SARIF 2.1.0</a></li>
      <li><a :href="`/api/v1/scan/${scanId}/export/markdown`">Download issue-ready Markdown</a></li>
    </ul>
  </section>
</template>
