<script setup lang="ts">
defineProps<{ drawerOpen: boolean }>();
const emit = defineEmits<{ toggleSidebar: [] }>();
</script>

<template>
  <header
    class="bg-canvas/85 sticky top-0 z-30 flex h-14 items-center gap-3 px-4 backdrop-blur-md sm:px-6"
  >
    <button
      type="button"
      class="text-ink-500 hover:bg-ink-100 hover:text-ink-900 focus-visible:ring-brand-500 inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none lg:hidden"
      :aria-expanded="drawerOpen"
      aria-controls="app-sidebar"
      aria-label="Open navigation"
      @click="emit('toggleSidebar')"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        class="h-5 w-5"
        aria-hidden="true"
      >
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>

    <NuxtLink
      to="/app"
      class="focus-visible:ring-brand-500 flex items-center gap-2.5 rounded-[var(--radius-control)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none lg:hidden"
    >
      <span
        class="bg-brand-500 text-ink-50 inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] text-xs font-bold tracking-tight"
        aria-hidden="true"
        >DA</span
      >
      <span class="text-ink-900 hidden text-sm font-semibold tracking-tight sm:inline"
        >DPDPA Auditor</span
      >
    </NuxtLink>

    <span class="bg-ink-200 mx-1 hidden h-5 w-px sm:block lg:hidden" aria-hidden="true" />

    <p class="text-ink-500 hidden items-center gap-1.5 font-mono text-xs md:flex">
      <span class="bg-brand-500 h-1.5 w-1.5 rounded-full" aria-hidden="true" />
      compliance workspace
    </p>

    <div class="ml-auto flex items-center gap-2">
      <button
        type="button"
        class="bg-surface text-ink-700 hover:bg-ink-100 focus-visible:ring-brand-500 inline-flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <span
          class="bg-brand-50 text-brand-900 flex h-4 w-4 items-center justify-center rounded-sm text-xs font-bold"
          aria-hidden="true"
          >A</span
        >
        <span class="max-w-40 truncate">Your organisation</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="text-ink-400 h-3.5 w-3.5"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <button
        type="button"
        class="bg-surface text-ink-500 hover:bg-ink-100 hover:text-ink-800 focus-visible:ring-brand-500 hidden items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 py-1.5 font-mono text-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:inline-flex"
        aria-label="Open command palette ⌘K"
      >
        <span aria-hidden="true">⌘K</span>
      </button>

      <button
        type="button"
        class="bg-ink-100 text-ink-800 ring-ink-200 hover:bg-ink-200 focus-visible:ring-brand-500 inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-pill)] text-xs font-semibold ring-1 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        aria-label="Account menu, DS"
      >
        <span aria-hidden="true">DS</span>
      </button>
    </div>
  </header>
</template>
