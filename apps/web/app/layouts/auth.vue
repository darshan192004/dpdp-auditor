<template>
  <div class="bg-ink-50 text-ink-800 flex min-h-screen flex-col">
    <header class="border-ink-200 flex items-center justify-between border-b bg-white px-6 py-3">
      <NuxtLink
        to="/"
        class="text-ink-900 focus-visible:ring-brand-500 rounded-[var(--radius-control)] text-sm font-semibold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        DPDPA Auditor
      </NuxtLink>
      <NuxtLink
        to="/"
        class="text-ink-600 hover:text-ink-900 focus-visible:ring-brand-500 rounded-[var(--radius-control)] text-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        Back to site
      </NuxtLink>
    </header>

    <main id="main" tabindex="-1" class="flex flex-1 items-center justify-center px-6 py-12">
      <div class="w-full max-w-md">
        <slot />
      </div>
    </main>
  </div>
</template>
