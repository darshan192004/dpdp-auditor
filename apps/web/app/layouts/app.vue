<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue';

import AppSidebar from '~/components/shell/AppSidebar.vue';
import AppTopbar from '~/components/shell/AppTopbar.vue';

// The palette is only needed after the first ⌘K, so keep its render function
// out of the initial shell bundle and out of every page's DOM.
const CommandPalette = defineAsyncComponent(() => import('~/components/shell/CommandPalette.vue'));

const drawerOpen = ref(false);
const paletteOpen = ref(false);
const paletteMounted = ref(false);

function openPalette(): void {
  paletteMounted.value = true;
  paletteOpen.value = true;
}

/** ⌘K / Ctrl+K is the industry-standard palette shortcut (Untitled UI, Preline). */
function onKeydown(event: KeyboardEvent): void {
  if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    if (paletteOpen.value) paletteOpen.value = false;
    else openPalette();
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
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
        <AppTopbar
          :drawer-open="drawerOpen"
          @toggle-sidebar="drawerOpen = !drawerOpen"
          @open-palette="openPalette"
        />

        <main id="main" tabindex="-1" class="min-w-0 flex-1">
          <div class="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <slot />
          </div>
        </main>
      </div>
    </div>

    <CommandPalette v-if="paletteMounted" v-model:open="paletteOpen" />
  </div>
</template>
