<template>
  <div class="bg-canvas text-ink-800 min-h-screen">
    <a
      href="#main"
      class="focus:text-ink-900 focus:ring-brand-500 focus:bg-surface sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-[var(--radius-control)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-[var(--shadow-popover)] focus:ring-2 focus:ring-offset-2 focus:outline-none"
    >
      Skip to content
    </a>
    <slot />
  </div>
</template>
