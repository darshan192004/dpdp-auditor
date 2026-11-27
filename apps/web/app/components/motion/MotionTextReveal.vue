<script setup lang="ts">
import { motion } from 'motion-v';
import { computed } from 'vue';

import { ENTER_MOTION, useReadinessMotion } from '../../composables/useReadinessMotion';

const props = withDefaults(
  defineProps<{
    text: string;
    as?: 'h1' | 'h2' | 'p';
    delay?: number;
    id?: string | undefined;
  }>(),
  { as: 'p', delay: 0, id: undefined },
);

const { reduceMotion } = useReadinessMotion();
const words = computed(() => props.text.split(' '));
const variants = computed(() =>
  reduceMotion.value
    ? { hidden: {}, visible: {} }
    : {
        hidden: { opacity: 0, y: 8, filter: 'blur(4px)' },
        visible: { ...ENTER_MOTION, filter: 'blur(0px)' },
      },
);

function wordTransition(index: number) {
  return reduceMotion.value
    ? { duration: 0 }
    : { delay: props.delay + index * 0.04, duration: 0.24 };
}
</script>

<template>
  <motion.h1
    v-if="as === 'h1'"
    :id="id"
    data-testid="motion-text-reveal"
    class="text-ink-900"
    :initial="reduceMotion ? false : 'hidden'"
    :animate="reduceMotion ? {} : 'visible'"
    :variants="variants"
    :aria-label="text"
  >
    <motion.span
      v-for="(word, index) in words"
      :key="index"
      :variants="variants"
      :custom="index"
      :transition="wordTransition(index)"
      class="inline-block"
      >{{ word }}{{ index < words.length - 1 ? '\u00A0' : '' }}</motion.span
    >
  </motion.h1>
  <motion.h2
    v-else-if="as === 'h2'"
    :id="id"
    data-testid="motion-text-reveal"
    class="text-ink-900"
    :initial="reduceMotion ? false : 'hidden'"
    :animate="reduceMotion ? {} : 'visible'"
    :variants="variants"
    :aria-label="text"
  >
    <motion.span
      v-for="(word, index) in words"
      :key="index"
      :variants="variants"
      :custom="index"
      :transition="wordTransition(index)"
      class="inline-block"
      >{{ word }}{{ index < words.length - 1 ? '\u00A0' : '' }}</motion.span
    >
  </motion.h2>
  <motion.p
    v-else
    :id="id"
    data-testid="motion-text-reveal"
    class="text-ink-500"
    :initial="reduceMotion ? false : 'hidden'"
    :animate="reduceMotion ? {} : 'visible'"
    :variants="variants"
    :aria-label="text"
  >
    <motion.span
      v-for="(word, index) in words"
      :key="index"
      :variants="variants"
      :custom="index"
      :transition="wordTransition(index)"
      class="inline-block"
      >{{ word }}{{ index < words.length - 1 ? '\u00A0' : '' }}</motion.span
    >
  </motion.p>
</template>
