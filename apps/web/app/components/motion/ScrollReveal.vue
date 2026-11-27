<script setup lang="ts">
import { motion } from 'motion-v';

import { ENTER_MOTION, useReadinessMotion } from '../../composables/useReadinessMotion';

const { reduceMotion } = useReadinessMotion();
</script>

<template>
  <!-- motion-v scroll props are camelCase by API contract. -->
  <!-- eslint-disable vue/attribute-hyphenation -->
  <motion.div
    data-testid="scroll-reveal"
    class="motion-scroll-reveal"
    :initial="reduceMotion ? false : { opacity: 0, y: 12 }"
    :whileInView="reduceMotion ? {} : ENTER_MOTION"
    :inViewOptions="{ once: true, amount: 0.2 }"
    :transition="reduceMotion ? { duration: 0 } : { duration: 0.28, ease: [0.16, 1, 0.3, 1] }"
  >
    <slot />
  </motion.div>
</template>
