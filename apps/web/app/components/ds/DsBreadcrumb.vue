<script setup lang="ts">
import type { Crumb } from '~/utils/breadcrumbs';

defineProps<{ crumbs: Crumb[] }>();
</script>

<template>
  <nav
    aria-label="Breadcrumb"
    class="text-ink-400 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs"
  >
    <template v-for="(crumb, index) in crumbs" :key="crumb.label">
      <span v-if="index > 0" aria-hidden="true">/</span>
      <NuxtLink v-if="crumb.to" :to="crumb.to" class="hover:text-brand-500 break-all">
        {{ crumb.label }}
      </NuxtLink>
      <span v-else aria-current="page" class="break-all">{{ crumb.label }}</span>
    </template>
  </nav>
</template>
