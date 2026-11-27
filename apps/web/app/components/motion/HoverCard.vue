<script setup lang="ts">
import { AnimatePresence, motion } from 'motion-v';
import { ref, useId } from 'vue';

import {
  ENTER_MOTION,
  SUBTLE_MOTION,
  useReadinessMotion,
} from '../../composables/useReadinessMotion';

withDefaults(defineProps<{ label: string; detail: string; side?: 'top' | 'bottom' }>(), {
  side: 'top',
});

const HOVER_LIFT = { y: -2 } as const;
const show = ref(false);
const id = useId();
const { reduceMotion } = useReadinessMotion();
</script>

<template>
  <!-- motion-v gesture props are camelCase by API contract. -->
  <!-- eslint-disable vue/attribute-hyphenation -->
  <span class="relative inline-flex">
    <motion.span
      data-testid="hover-card-trigger"
      class="focus-visible:ring-brand-500 rounded-[var(--radius-control)] focus-visible:ring-2 focus-visible:outline-none"
      tabindex="0"
      :aria-describedby="show ? id : undefined"
      :whileHover="reduceMotion ? {} : HOVER_LIFT"
      :whileFocus="reduceMotion ? {} : HOVER_LIFT"
      :transition="reduceMotion ? { duration: 0 } : SUBTLE_MOTION"
      @mouseenter="show = true"
      @mouseleave="show = false"
      @focus="show = true"
      @blur="show = false"
    >
      <slot />
    </motion.span>
    <AnimatePresence>
      <motion.span
        v-if="show"
        :id="id"
        role="tooltip"
        class="bg-surface-raised border-ink-200 absolute left-1/2 z-40 w-56 -translate-x-1/2 rounded-[var(--radius-control)] border p-2 text-xs shadow-[var(--shadow-popover)]"
        :class="side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'"
        :initial="reduceMotion ? false : { opacity: 0, y: side === 'top' ? 4 : -4 }"
        :animate="reduceMotion ? {} : ENTER_MOTION"
        :exit="reduceMotion ? {} : { opacity: 0 }"
        :transition="reduceMotion ? { duration: 0 } : SUBTLE_MOTION"
      >
        <strong class="text-ink-800 block font-semibold">{{ label }}</strong>
        <span class="text-ink-500 mt-1 block">{{ detail }}</span>
      </motion.span>
    </AnimatePresence>
  </span>
</template>
