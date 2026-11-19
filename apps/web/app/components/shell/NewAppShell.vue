<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';

import ConsoleSidebar from '~/components/shell/ConsoleSidebar.vue';
import AppIcon from '~/components/ui/AppIcon.vue';
import DsBreadcrumb from '~/components/ds/DsBreadcrumb.vue';
import DsToastHost from '~/components/ds/DsToastHost.vue';
import { breadcrumbsFor } from '~/utils/breadcrumbs';

const route = useRoute();
const crumbs = computed(() => breadcrumbsFor(route.path));

// The rail stays put while the document scrolls; the hamburger collapses it at
// any width. Below lg the rail becomes a drawer so narrow screens keep their
// full content width. `isDesktop` starts true to match the SSR render (the rail
// is hidden below lg by CSS), then tracks the real breakpoint after mount so
// the hamburger icon/aria reflect only the navigation that is actually active.
const desktopOpen = ref(true);
const mobileOpen = ref(false);
const isDesktop = ref(true);
let media: MediaQueryList | null = null;

function syncBreakpoint(): void {
  isDesktop.value = window.matchMedia('(min-width: 1024px)').matches;
}

function onGlobalKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && mobileOpen.value) closeMobile();
}

onMounted(() => {
  syncBreakpoint();
  media = window.matchMedia('(min-width: 1024px)');
  media.addEventListener('change', syncBreakpoint);
  window.addEventListener('keydown', onGlobalKeydown);
});

onUnmounted(() => {
  media?.removeEventListener('change', syncBreakpoint);
  window.removeEventListener('keydown', onGlobalKeydown);
});

const navOpen = computed(() => (isDesktop.value ? desktopOpen.value : mobileOpen.value));

function toggleNav(): void {
  if (isDesktop.value) desktopOpen.value = !desktopOpen.value;
  else mobileOpen.value = !mobileOpen.value;
}

function closeMobile(): void {
  mobileOpen.value = false;
}
</script>

<template>
  <div class="bg-canvas text-ink-800 min-h-screen">
    <a
      href="#main"
      class="focus-visible:ring-brand-500 focus:bg-surface sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-[var(--radius-control)] focus:px-4 focus:py-2 focus:ring-2"
    >
      Skip to content
    </a>

    <div v-if="desktopOpen" id="app-sidebar" class="fixed inset-y-0 left-0 z-30 hidden lg:block">
      <ConsoleSidebar />
    </div>

    <div
      v-if="mobileOpen"
      id="app-sidebar-mobile"
      class="fixed inset-0 z-40 lg:hidden"
      role="dialog"
      aria-label="Navigation"
      @keydown.esc="closeMobile"
    >
      <div class="absolute inset-0 bg-[var(--color-overlay)]" @click="closeMobile" />
      <div class="relative h-full w-64 max-w-[85vw]">
        <ConsoleSidebar @navigate="closeMobile" />
      </div>
    </div>

    <div class="flex min-h-screen" :class="desktopOpen ? 'lg:pl-64' : ''">
      <div class="flex min-w-0 flex-1 flex-col">
        <header class="border-ink-200 bg-canvas sticky top-0 z-20 border-b px-4 py-3 lg:px-6">
          <div class="flex items-center gap-3">
            <button
              type="button"
              class="border-ink-300 hover:bg-surface-raised inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] border transition-colors duration-[var(--motion-fast)]"
              :aria-label="navOpen ? 'Close navigation' : 'Open navigation'"
              :aria-expanded="navOpen"
              @click="toggleNav"
            >
              <AppIcon :name="navOpen ? 'x' : 'menu'" :size="18" />
            </button>
            <NuxtLink to="/app" class="text-brand-500 font-mono text-sm lg:hidden">
              DPDPA / CONSOLE
            </NuxtLink>
            <DsBreadcrumb :crumbs="crumbs" />
          </div>
        </header>

        <main id="main" tabindex="-1" class="min-w-0 flex-1 px-4 py-6 lg:px-6">
          <slot />
        </main>
      </div>
    </div>

    <DsToastHost />
  </div>
</template>
