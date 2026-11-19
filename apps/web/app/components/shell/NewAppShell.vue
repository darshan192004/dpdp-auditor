<script setup lang="ts">
import { computed, ref } from 'vue';

import DsBreadcrumb from '~/components/ds/DsBreadcrumb.vue';
import DsToastHost from '~/components/ds/DsToastHost.vue';
import { breadcrumbsFor } from '~/utils/breadcrumbs';

const route = useRoute();
const crumbs = computed(() => breadcrumbsFor(route.path));

/** The drawer is only reachable below the `lg` breakpoint. */
const mobileOpen = ref(false);

const NAV = [
  { label: 'Overview', to: '/app' },
  { label: 'Scans', to: '/app/scans' },
  { label: 'Remediation', to: '/app/remediation' },
  { label: 'Rules', to: '/app/rules' },
  { label: 'Audit', to: '/app/audit' },
  { label: 'Settings', to: '/app/settings/org' },
  { label: 'Health', to: '/health' },
] as const;
</script>

<template>
  <div class="bg-canvas text-ink-800 min-h-screen">
    <a
      href="#main"
      class="focus-visible:ring-brand-500 focus:bg-surface sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-[var(--radius-control)] focus:px-4 focus:py-2 focus:ring-2"
    >
      Skip to content
    </a>
    <div class="flex min-h-screen">
      <!-- Pinned at >=1024px; hidden below so narrow viewports never scroll horizontally. -->
      <aside id="app-sidebar" class="bg-ink-50 hidden w-60 shrink-0 p-4 lg:block">
        <NuxtLink to="/app" class="text-brand-500 font-mono text-sm">DPDPA / CONSOLE</NuxtLink>
        <nav aria-label="Primary" class="mt-6 flex flex-col gap-1">
          <NuxtLink
            v-for="item in NAV"
            :key="item.to"
            :to="item.to"
            class="text-ink-400 hover:bg-surface-raised hover:text-ink-900 rounded-[var(--radius-control)] px-3 py-2 text-sm"
          >
            {{ item.label }}
          </NuxtLink>
        </nav>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col">
        <header class="border-ink-200 bg-canvas border-b px-4 py-3 lg:px-6">
          <div class="flex items-center gap-3">
            <button
              type="button"
              class="border-ink-300 rounded-[var(--radius-control)] px-2 py-1 text-sm lg:hidden"
              :aria-label="mobileOpen ? 'Close navigation' : 'Open navigation'"
              :aria-expanded="mobileOpen"
              @click="mobileOpen = !mobileOpen"
            >
              <span aria-hidden="true">{{ mobileOpen ? '×' : '≡' }}</span>
            </button>
            <NuxtLink to="/app" class="text-brand-500 font-mono text-sm lg:hidden">
              DPDPA / CONSOLE
            </NuxtLink>
            <DsBreadcrumb :crumbs="crumbs" />
          </div>
        </header>
        <main id="main" tabindex="-1" class="min-w-0 flex-1 px-4 py-6 lg:px-6">
          <Transition name="route" mode="out-in">
            <slot />
          </Transition>
        </main>
      </div>
    </div>

    <!-- Mobile drawer: same destinations, no horizontal document overflow. -->
    <div
      v-if="mobileOpen"
      class="fixed inset-0 z-40 lg:hidden"
      role="dialog"
      aria-label="Navigation"
    >
      <div class="absolute inset-0 bg-[var(--color-overlay)]" @click="mobileOpen = false" />
      <aside class="bg-ink-50 relative h-full w-64 max-w-[85vw] p-4">
        <button
          type="button"
          aria-label="Close navigation"
          class="border-ink-300 rounded-[var(--radius-control)] px-2 py-1 text-sm"
          @click="mobileOpen = false"
        >
          <span aria-hidden="true">×</span>
        </button>
        <nav aria-label="Primary" class="mt-6 flex flex-col gap-1">
          <NuxtLink
            v-for="item in NAV"
            :key="item.to"
            :to="item.to"
            class="text-ink-400 hover:bg-surface-raised hover:text-ink-900 rounded-[var(--radius-control)] px-3 py-2 text-sm"
            @click="mobileOpen = false"
          >
            {{ item.label }}
          </NuxtLink>
        </nav>
      </aside>
    </div>

    <DsToastHost />
  </div>
</template>

<style scoped>
.route-enter-active,
.route-leave-active {
  transition:
    opacity var(--motion-base) var(--ease-out),
    transform var(--motion-base) var(--ease-out);
}
.route-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.route-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
