<script setup lang="ts">
import { computed } from 'vue';

/**
 * Inline Lucide geometry, matching the shell's icon approach: no icon
 * collection dependency, and `currentColor` keeps glyphs on semantic tokens.
 */
const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 16 });

const PATHS: Record<string, string[]> = {
  'shield-alert': [
    'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
    'M12 8v4',
    'M12 16h.01',
  ],
  'shield-check': [
    'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
    'm9 12 2 2 4-4',
  ],
  'alert-triangle': [
    'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3',
    'M12 9v4',
    'M12 17h.01',
  ],
  'alert-circle': ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 8v4', 'M12 16h.01'],
  info: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 16v-4', 'M12 8h.01'],
  circle: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z'],
  'circle-half': ['M12 2a10 10 0 0 1 0 20z'],
  check: ['M20 6 9 17l-5-5'],
  x: ['M18 6 6 18', 'm6 6 12 12'],
  minus: ['M5 12h14'],
  plus: ['M5 12h14', 'M12 5v14'],
  target: [
    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
    'M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z',
    'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  ],
  wave: ['M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1'],
  lightbulb: [
    'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5',
    'M9 18h6',
    'M10 22h4',
  ],
  search: ['m21 21-4.34-4.34', 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z'],
  filter: ['M22 3H2l8 9.46V19l4 2v-8.54z'],
  'chevron-left': ['m15 18-6-6 6-6'],
  'chevron-right': ['m9 18 6-6-6-6'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  'external-link': [
    'M15 3h6v6',
    'M10 14 21 3',
    'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  ],
  copy: [
    'M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
    'M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2',
  ],
  'rotate-ccw': ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5'],
  'arrow-up-right': ['M7 17 17 7', 'M7 7h10v10'],
  code: ['m16 18 6-6-6-6', 'm8 6-6 6 6 6'],
  cloud: ['M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.6 1.5A4 4 0 0 0 6 19z'],
  'clipboard-check': [
    'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2',
    'M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2',
    'm9 14 2 2 4-4',
  ],
  key: ['M15 9a3 3 0 1 0-3-3', 'm12 9-9 9v3h3l9-9'],
  lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  'bar-chart-2': ['M3 3v16h2V3', 'M9 3v14h2V3', 'M15 3v8h2V3', 'M21 3v16h2V3'],
  activity: ['M22 12h-4l3 3L9 3l3 3H2'],
  users: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'],
  'file-text': [
    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
    'M14 2v6h6',
    'M16 13H8',
    'M16 17H8',
    'M18 9h2',
    'M16 15h2',
    'M18 5h2',
  ],
  'layout-grid': ['M3 3h18v18H3V3zm16 16h-4v-4h4v4zm0-8h-4V7h4v4zM7 11H3V7h4v4zm12-4h-4V3h4v4z'],
  'trending-up': [
    'M23 4v16H1',
    'M23 4l-9 15',
    'M1 20l9-15',
    'M21 4h-4a4 4 0 0 0-4 4v12a4 4 0 0 0 4 4h4',
  ],
  clock: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20', 'M12 12H7m5 6V7'],
  folder: [
    'M22 19a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13z',
    'M2 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2H2V6z',
  ],
};

const paths = computed(() => PATHS[props.name] ?? []);
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class="shrink-0"
  >
    <path v-for="(d, index) in paths" :key="index" :d="d" />
  </svg>
</template>
