<script setup lang="ts">
// Placeholder onboarding route: a signed-in user without an organisation lands
// here. Real org creation is Phase 2 (plan Task 6).
definePageMeta({ layout: 'auth' });
</script>

<template>
  <div class="space-y-4">
    <p class="text-ink-400 font-mono text-xs tracking-widest uppercase">Onboarding</p>
    <h1 class="text-ink-900 text-2xl font-semibold tracking-tight">Set up your organisation</h1>
    <p class="text-ink-600 text-sm leading-6">
      Create an organisation before running your first scan. Organisation creation is provisioned
      with your workspace, so this step is completed for you during setup.
    </p>
    <NuxtLink
      to="/app"
      class="bg-brand-500 hover:bg-brand-600 focus-visible:ring-brand-500 text-ink-50 inline-flex items-center gap-1.5 rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      Open the dashboard
      <span aria-hidden="true">→</span>
    </NuxtLink>
  </div>
</template>
