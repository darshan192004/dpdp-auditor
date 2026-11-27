import { useReducedMotion } from 'motion-v';
import { computed, type ComputedRef, type Ref } from 'vue';

export const ENTER_MOTION = { opacity: 1, y: 0 } as const;
export const SUBTLE_MOTION = { type: 'spring', stiffness: 320, damping: 30, mass: 0.8 } as const;

/**
 * Motion vocabulary for readiness UI. Every value is derived from the reactive
 * reduced-motion preference, so a runtime OS change collapses the JS motion too.
 */
export function useReadinessMotion(): {
  reduceMotion: Ref<boolean>;
  enter: ComputedRef<Record<string, unknown>>;
  subtle: ComputedRef<Record<string, unknown>>;
} {
  const reduceMotion = useReducedMotion();

  const enter = computed<Record<string, unknown>>(() => ({
    initial: reduceMotion.value ? false : { opacity: 0, y: 10 },
    animate: reduceMotion.value ? false : ENTER_MOTION,
    transition: reduceMotion.value ? { duration: 0 } : SUBTLE_MOTION,
  }));

  const subtle = computed<Record<string, unknown>>(() =>
    reduceMotion.value ? { duration: 0 } : SUBTLE_MOTION,
  );

  return { reduceMotion, enter, subtle };
}
