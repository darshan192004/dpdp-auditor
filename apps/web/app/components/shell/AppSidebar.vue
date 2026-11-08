<script setup lang="ts">
import { APP_NAV } from '~/utils/nav';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

// Inline 24px paths (lucide geometry) — no icon-collection dependency, and
// `currentColor` keeps the glyph on the semantic text tokens.
const ICON_PATHS: Record<string, string[]> = {
  overview: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'],
  repositories: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  scans: [
    'M3 7V5a2 2 0 0 1 2-2h2',
    'M17 3h2a2 2 0 0 1 2 2v2',
    'M21 17v2a2 2 0 0 1-2 2h-2',
    'M7 21H5a2 2 0 0 1-2-2v-2',
    'M7 12h10',
  ],
  rules: ['m9 11 3 3L22 4', 'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11'],
  audit: [
    'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2',
    'M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2',
    'm9 14 2 2 4-4',
  ],
  settings: [
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    'M12 2v3',
    'M12 19v3',
    'M4.2 4.2l2.1 2.1',
    'M17.7 17.7l2.1 2.1',
    'M2 12h3',
    'M19 12h3',
    'M4.2 19.8l2.1-2.1',
    'M17.7 6.3l2.1-2.1',
  ],
};

const pathsFor = (icon: string) => ICON_PATHS[icon] ?? [];
</script>

<template>
  <aside
    id="app-sidebar"
    :class="[
      'border-ink-200 w-60 shrink-0 flex-col border-r bg-white',
      props.open ? 'fixed inset-y-0 left-0 z-40 flex' : 'hidden',
      'lg:sticky lg:top-14 lg:flex lg:h-[calc(100vh-3.5rem)]',
    ]"
  >
    <div class="border-ink-200 flex items-center justify-between border-b px-4 py-3 lg:hidden">
      <span class="text-ink-900 text-sm font-semibold">Navigation</span>
      <button
        type="button"
        class="text-ink-500 hover:bg-ink-100 hover:text-ink-900 focus-visible:ring-brand-500 inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        aria-label="Close navigation"
        @click="emit('close')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          class="h-4 w-4"
          aria-hidden="true"
        >
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>
    </div>

    <nav aria-label="Primary" class="flex-1 overflow-y-auto px-3 py-4">
      <ul class="space-y-1">
        <li v-for="item in APP_NAV" :key="item.to">
          <NuxtLink
            :to="item.to"
            class="text-ink-700 hover:bg-ink-100 hover:text-ink-900 focus-visible:ring-brand-500 flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            active-class="bg-brand-50 text-brand-700 hover:bg-brand-50 hover:text-brand-700"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-4 w-4 shrink-0"
              aria-hidden="true"
            >
              <path v-for="(d, index) in pathsFor(item.icon)" :key="index" :d="d" />
            </svg>
            {{ item.label }}
          </NuxtLink>
        </li>
      </ul>
    </nav>

    <div class="border-ink-200 border-t p-4">
      <p class="text-ink-500 text-xs">Plan usage</p>
      <p class="text-ink-700 mt-1 text-sm">No scans yet</p>
      <NuxtLink
        to="/app/settings/org"
        class="text-brand-700 hover:text-brand-600 focus-visible:ring-brand-500 mt-2 inline-block rounded-[var(--radius-control)] text-xs font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        Review plan limits
      </NuxtLink>
    </div>
  </aside>
</template>
