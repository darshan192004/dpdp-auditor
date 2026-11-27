import { isRef, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ENTER_MOTION, SUBTLE_MOTION } from '../app/composables/useReadinessMotion';

/** Minimal controllable MediaQueryList for the OS reduced-motion preference. */
function fakeReducedMotion(initial: boolean) {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const mediaQueryList = {
    matches: initial,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) =>
      listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) =>
      listeners.delete(listener),
    addListener: (listener: (event: { matches: boolean }) => void) => listeners.add(listener),
    removeListener: (listener: (event: { matches: boolean }) => void) => listeners.delete(listener),
    dispatchEvent: () => true,
  };

  return {
    mediaQueryList,
    setPreference(reduced: boolean) {
      mediaQueryList.matches = reduced;
      for (const listener of listeners) listener({ matches: reduced });
    },
  };
}

describe('readiness motion vocabulary', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses transform/opacity only for entry motion', () => {
    expect(ENTER_MOTION).toEqual({ opacity: 1, y: 0 });
  });

  it('uses a short spring for subtle interactions', () => {
    expect(SUBTLE_MOTION).toEqual({ type: 'spring', stiffness: 320, damping: 30, mass: 0.8 });
  });

  it('derives reactive motion from the reduced-motion preference', async () => {
    const preference = fakeReducedMotion(true);
    vi.stubGlobal('matchMedia', () => preference.mediaQueryList);
    vi.resetModules();
    const { useReadinessMotion } = await import('../app/composables/useReadinessMotion');

    const { reduceMotion, enter, subtle } = useReadinessMotion();
    expect(isRef(reduceMotion)).toBe(true);
    expect(isRef(enter)).toBe(true);
    expect(isRef(subtle)).toBe(true);
    expect(reduceMotion.value).toBe(true);
    expect(enter.value).toMatchObject({ initial: false, animate: false });
    expect(subtle.value).toEqual({ duration: 0 });

    preference.setPreference(false);
    await nextTick();
    expect(reduceMotion.value).toBe(false);
    expect(enter.value).toMatchObject({
      initial: { opacity: 0, y: 10 },
      animate: ENTER_MOTION,
    });
    expect(subtle.value).toEqual(SUBTLE_MOTION);
  });
});
