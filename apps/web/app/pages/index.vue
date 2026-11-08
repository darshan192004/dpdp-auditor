<script setup lang="ts">
// Landing page — docs/design.md §2 route map ("/", SSG/ISR, public).
// Full marketing design lands in Phase 5; this establishes route + copy rules.
</script>

<template>
  <main
    id="main"
    tabindex="-1"
    class="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16"
  >
    <p class="text-brand-700 font-mono text-xs tracking-wide">DPDPA compliance workbench</p>
    <h1 class="text-ink-900 mt-3 text-2xl font-semibold">DPDPA GitHub Code Auditor</h1>
    <p class="text-ink-600 mt-4 text-base leading-6">
      Technical evidence for DPDPA controls, drawn straight from your repositories: a score, the
      findings behind it, and a specific remediation for each one.
    </p>
    <div class="mt-8 flex items-center gap-4">
      <a
        href="/app"
        class="bg-brand-700 hover:bg-brand-600 focus-visible:ring-brand-500 inline-flex items-center rounded-[var(--radius-control)] px-4 py-2 text-sm font-medium text-white transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        Open dashboard
      </a>
      <a
        href="/login"
        class="text-ink-600 hover:text-ink-900 focus-visible:ring-brand-500 rounded-[var(--radius-control)] text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        Sign in
      </a>
    </div>
  </main>
</template>
