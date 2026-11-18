<script setup lang="ts">
import type { Crumb } from '~/utils/breadcrumbs';

defineProps<{ crumbs: Crumb[] }>();
</script>

<template>
  <nav aria-label="Breadcrumb" class="text-ink-400 flex items-center gap-2 font-mono text-xs">
    <template v-for="(crumb, index) in crumbs" :key="crumb.label">
      <span v-if="index > 0" aria-hidden="true">/</span>
      <NuxtLink v-if="crumb.to" :to="crumb.to" class="hover:text-brand-500">
        {{ crumb.label }}
      </NuxtLink>
      <span v-else aria-current="page">{{ crumb.label }}</span>
    </template>
  </nav>
</template>
