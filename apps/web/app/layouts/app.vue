<script setup lang="ts">
import { ref } from 'vue';

import AppSidebar from '~/components/shell/AppSidebar.vue';
import AppTopbar from '~/components/shell/AppTopbar.vue';

const drawerOpen = ref(false);
</script>

<template>
  <div class="bg-ink-50 text-ink-800 min-h-screen">
    <a
      href="#main"
      class="focus:text-ink-900 focus:ring-brand-500 sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-[var(--radius-control)] focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-[var(--shadow-popover)] focus:ring-2 focus:ring-offset-2 focus:outline-none"
    >
      Skip to content
    </a>

    <AppTopbar :drawer-open="drawerOpen" @toggle-sidebar="drawerOpen = !drawerOpen" />

    <div class="flex">
      <AppSidebar :open="drawerOpen" @close="drawerOpen = false" />

      <main id="main" tabindex="-1" class="min-w-0 flex-1">
        <div class="mx-auto w-full max-w-[1280px] px-6 py-6">
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>
