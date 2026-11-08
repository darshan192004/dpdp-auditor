<script setup lang="ts">
defineProps<{
  title: string;
  breadcrumbs?: Array<{ label: string; to?: string }>;
}>();
</script>

<template>
  <div class="flex flex-wrap items-start justify-between gap-4">
    <div class="min-w-0">
      <nav v-if="breadcrumbs?.length" aria-label="Breadcrumb" class="mb-1">
        <ol class="text-ink-500 flex flex-wrap items-center gap-1 text-xs">
          <li
            v-for="(crumb, index) in breadcrumbs"
            :key="`${crumb.label}-${index}`"
            class="flex items-center gap-1"
          >
            <NuxtLink
              v-if="crumb.to"
              :to="crumb.to"
              class="hover:text-ink-800 focus-visible:ring-brand-500 rounded-[var(--radius-control)] underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              {{ crumb.label }}
            </NuxtLink>
            <span v-else>{{ crumb.label }}</span>
            <span v-if="index < breadcrumbs.length - 1" aria-hidden="true">/</span>
          </li>
        </ol>
      </nav>
      <h1 class="text-ink-900 text-2xl font-semibold">{{ title }}</h1>
    </div>

    <div v-if="$slots.actions" class="flex items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
