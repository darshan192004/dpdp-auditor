<script setup lang="ts">
/**
 * Glass card — OpsPulse-style dark glass-morphism container.
 *
 * `bg-white/10` + `backdrop-blur` over the dark canvas, with a hairline
 * `border-white/10` for separation. Depth comes from surface steps, not
 * 1 px outlines (docs/design.md §6).
 */
const props = withDefaults(
  defineProps<{
    /**
     * Elevation step:
     * - `surface`  — flat card sitting on canvas (default).
     * - `raised`   — sits one step above a surface.
     * - `glass`    — semi-transparent glass over the page background.
     */
    elevation?: 'surface' | 'raised' | 'glass';
    padding?: 'none' | 'sm' | 'md' | 'lg';
  }>(),
  { elevation: 'surface', padding: 'md' },
);

const paddingClass = {
  none: 'p-0',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
}[props.padding];

const base =
  'border border-white/10 backdrop-blur-md rounded-[var(--radius-card)] shadow-[var(--shadow-card)] transition-colors';
const elevationClass = {
  surface: 'bg-surface',
  raised: 'bg-surface-raised',
  glass: 'bg-white/5',
}[props.elevation];
</script>

<template>
  <div class="relative overflow-hidden" :class="[base, elevationClass, paddingClass]">
    <slot />
  </div>
</template>
