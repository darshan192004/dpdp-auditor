<script setup lang="ts">
import { ref } from 'vue';

import AppSidebar from '~/components/shell/AppSidebar.vue';
import AppTopbar from '~/components/shell/AppTopbar.vue';

const drawerOpen = ref(false);
</script>

<template>
  <div class="bg-canvas text-ink-800 min-h-screen">
    <a
      href="#main"
      class="focus:text-ink-900 focus:ring-brand-500 focus:bg-surface sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-[var(--radius-control)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-[var(--shadow-popover)] focus:ring-2 focus:ring-offset-2 focus:outline-none"
    >
      Skip to content
    </a>

    <div class="flex min-h-screen">
      <AppSidebar :open="drawerOpen" @close="drawerOpen = false" />

      <div class="flex min-w-0 flex-1 flex-col">
        <AppTopbar :drawer-open="drawerOpen" @toggle-sidebar="drawerOpen = !drawerOpen" />

        <main id="main" tabindex="-1" class="min-w-0 flex-1">
          <div class="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <slot />
          </div>
        </main>
      </div>
    </div>
  </div>
</template>
