<script setup lang="ts">
// Landing page — docs/design.md §2 route map ("/", SSG/ISR, public).
// Full marketing design lands in Phase 5; this establishes route + copy rules.
const STEPS = [
  {
    step: '01',
    title: 'Connect',
    body: 'Point the auditor at a GitHub repository. It reads the default branch only.',
  },
  {
    step: '02',
    title: 'Scan',
    body: 'Semgrep, Checkov, and Gitleaks produce evidence; each finding maps to a DPDPA control.',
  },
  {
    step: '03',
    title: 'Fix',
    body: 'Triage with an audit trail and get a concrete remediation for every open finding.',
  },
] as const;
</script>

<template>
  <div class="min-h-screen">
    <header class="border-ink-200 border-b">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <NuxtLink
          to="/"
          class="focus-visible:ring-brand-500 flex items-center gap-2.5 rounded-[var(--radius-control)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <span
            class="bg-brand-500 text-ink-50 inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] text-xs font-bold"
            aria-hidden="true"
            >DA</span
          >
          <span class="text-ink-900 text-sm font-semibold tracking-tight">DPDPA Auditor</span>
        </NuxtLink>
        <a
          href="/login"
          class="text-ink-600 hover:text-ink-900 focus-visible:ring-brand-500 rounded-[var(--radius-control)] text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Sign in
        </a>
      </div>
    </header>

    <main id="main" tabindex="-1" class="mx-auto max-w-6xl px-6 py-16">
      <div class="grid items-start gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div>
          <p class="text-brand-700 font-mono text-xs tracking-widest uppercase">
            DPDPA compliance workbench
          </p>
          <h1 class="text-ink-900 mt-3 text-4xl font-semibold tracking-tight">
            DPDPA GitHub Code Auditor
          </h1>
          <p class="text-ink-600 mt-4 max-w-xl text-base leading-7">
            Technical evidence for DPDPA controls, drawn straight from your repositories: a score,
            the findings behind it, and a specific remediation for each one.
          </p>
          <div class="mt-8 flex flex-wrap items-center gap-4">
            <a
              href="/app"
              class="bg-brand-500 hover:bg-brand-600 focus-visible:ring-brand-500 text-ink-50 inline-flex items-center gap-1.5 rounded-[var(--radius-control)] px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Open dashboard
              <span aria-hidden="true">→</span>
            </a>
            <a
              href="/login"
              class="border-ink-200 text-ink-700 hover:bg-ink-100 focus-visible:ring-brand-500 inline-flex items-center rounded-[var(--radius-control)] border px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Sign in
            </a>
          </div>
          <p class="text-ink-500 mt-6 max-w-md text-xs">
            Engineering signals, not legal advice. Section 12 (right to access) is not assessed by
            code.
          </p>
        </div>

        <section
          aria-labelledby="how-heading"
          class="border-ink-200 bg-surface rounded-[var(--radius-card)] border p-5"
        >
          <div class="border-ink-200 flex items-center justify-between gap-2 border-b pb-3">
            <h2 id="how-heading" class="text-ink-900 text-sm font-semibold">How a scan works</h2>
            <span class="text-ink-400 font-mono text-xs">3 steps</span>
          </div>
          <ol class="divide-ink-200 divide-y">
            <li v-for="item in STEPS" :key="item.step" class="flex gap-4 py-4">
              <span class="text-brand-700 font-mono text-xs tabular-nums">{{ item.step }}</span>
              <div class="min-w-0">
                <p class="text-ink-900 text-sm font-medium">{{ item.title }}</p>
                <p class="text-ink-500 mt-1 text-xs leading-5">{{ item.body }}</p>
              </div>
            </li>
          </ol>
        </section>
      </div>
    </main>
  </div>
</template>
