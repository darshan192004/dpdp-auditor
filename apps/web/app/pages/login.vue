<script setup lang="ts">
// Placeholder sign-in route. Phase 2 owns the real auth flow; this page only
// exists so the auth middleware has a redirect target that renders (plan Task 6).
definePageMeta({ layout: 'auth' });
</script>

<template>
  <div class="space-y-3">
    <h1 class="text-ink-900 text-2xl font-semibold">Sign in</h1>
    <p class="text-ink-600 text-base leading-6">Sign in to continue to the auditor.</p>
  </div>
</template>
