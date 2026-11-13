<script setup lang="ts">
import geistLatinUrl from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url';
import geistMonoLatinUrl from '@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2?url';

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
</script>

<template>
  <NuxtLoadingIndicator />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
