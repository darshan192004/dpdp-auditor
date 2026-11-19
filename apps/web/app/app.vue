<script setup lang="ts">
import geistLatinUrl from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url';
import geistMonoLatinUrl from '@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2?url';

import AuthLayout from '~/layouts/auth.vue';
import DefaultLayout from '~/layouts/default.vue';
import PrintLayout from '~/layouts/print.vue';
import NewAppShell from '~/components/shell/NewAppShell.vue';

/**
 * Preload the two latin subsets that every route renders with. The bundled
 * @font-face rules are discovered only after the CSS parses, so preloading
 * removes one round-trip from first paint. Other subsets stay lazy: the
 * unicode-range means they are never fetched for English UI copy.
 */
useHead({
  link: [
    {
      rel: 'preload',
      href: geistLatinUrl,
      as: 'font',
      type: 'font/woff2',
      crossorigin: '',
    },
    {
      rel: 'preload',
      href: geistMonoLatinUrl,
      as: 'font',
      type: 'font/woff2',
      crossorigin: '',
    },
  ],
});

// Routes that opt out of the console chrome keep their own layout. Everything
// else renders inside the rebuilt Signal Console shell.
const standaloneLayout = computed(() => {
  const layout = useRoute().meta.layout;
  return layout === 'auth' || layout === 'print' || layout === 'default' ? layout : null;
});
</script>

<template>
  <NuxtLoadingIndicator />
  <AuthLayout v-if="standaloneLayout === 'auth'">
    <NuxtPage />
  </AuthLayout>
  <PrintLayout v-else-if="standaloneLayout === 'print'">
    <NuxtPage />
  </PrintLayout>
  <DefaultLayout v-else-if="standaloneLayout === 'default'">
    <NuxtPage />
  </DefaultLayout>
  <NewAppShell v-else>
    <NuxtPage />
  </NewAppShell>
</template>
