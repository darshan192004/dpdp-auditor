<script setup lang="ts">
import { computed } from 'vue';

import DsBreadcrumb from '~/components/ds/DsBreadcrumb.vue';
import DsToastHost from '~/components/ds/DsToastHost.vue';
import { breadcrumbsFor } from '~/utils/breadcrumbs';

const route = useRoute();
const crumbs = computed(() => breadcrumbsFor(route.path));

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
      class="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
    >
      Skip to content
    </a>
    <div class="flex min-h-screen">
      <aside class="bg-ink-50 w-60 shrink-0 p-4">
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
        <header class="border-ink-200 bg-canvas border-b px-6 py-3">
          <DsBreadcrumb :crumbs="crumbs" />
        </header>
        <main id="main" tabindex="-1" class="min-w-0 flex-1 px-6 py-6">
          <Transition name="route" mode="out-in">
            <slot />
          </Transition>
        </main>
      </div>
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
