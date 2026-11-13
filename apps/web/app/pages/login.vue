<script setup lang="ts">
// Placeholder sign-in route. Phase 2 owns the real auth flow; this page only
// exists so the auth middleware has a redirect target that renders (plan Task 6).
definePageMeta({ layout: 'auth' });
</script>

<template>
  <div class="space-y-4">
    <p class="text-ink-400 font-mono text-xs tracking-widest uppercase">Account</p>
    <h1 class="text-ink-900 text-2xl font-semibold tracking-tight">Sign in</h1>
    <p class="text-ink-600 text-sm leading-6">
      Sign in to continue to the auditor. Authentication is provisioned per organisation, so there
      is no password form here yet.
    </p>
    <NuxtLink
      to="/app"
      class="bg-brand-500 hover:bg-brand-600 focus-visible:ring-brand-500 text-ink-50 inline-flex items-center gap-1.5 rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      Continue to the dashboard
      <span aria-hidden="true">→</span>
    </NuxtLink>
  </div>
</template>
