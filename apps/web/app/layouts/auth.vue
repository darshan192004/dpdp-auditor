<template>
  <div class="bg-canvas text-ink-800 flex min-h-screen flex-col">
    <header class="bg-ink-50">
      <div class="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3">
        <NuxtLink
          to="/"
          class="focus-visible:ring-brand-500 flex items-center gap-2.5 rounded-[var(--radius-control)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <span
            class="bg-brand-500 text-ink-50 inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] text-xs font-bold tracking-tight"
            aria-hidden="true"
            >DA</span
          >
          <span class="text-ink-900 text-sm font-semibold tracking-tight">DPDPA Auditor</span>
        </NuxtLink>
        <NuxtLink
          to="/"
          class="text-ink-600 hover:text-ink-900 focus-visible:ring-brand-500 rounded-[var(--radius-control)] text-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Back to site
        </NuxtLink>
      </div>
    </header>

    <main id="main" tabindex="-1" class="flex flex-1 items-center justify-center px-6 py-12">
      <div
        class="bg-surface w-full max-w-md rounded-[var(--radius-card)] p-6 shadow-[var(--shadow-card)]"
      >
        <slot />
      </div>
    </main>

    <footer class="px-6 py-3">
      <p class="text-ink-500 mx-auto w-full max-w-6xl text-xs">
        Engineering signals, not legal advice.
      </p>
    </footer>
  </div>
</template>
