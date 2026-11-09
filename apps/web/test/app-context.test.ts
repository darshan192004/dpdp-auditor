import { mountSuspended } from '@nuxt/test-utils/runtime';
import { defineComponent, h } from 'vue';
import { describe, expect, it } from 'vitest';
import { useAppContext } from '../app/composables/useAppContext';

// design.md §7.6 pins both the useState keys and their initial values.
describe('useAppContext (design §7.6)', () => {
  it('exposes exactly the documented keys with their initial values', async () => {
    let ctx: ReturnType<typeof useAppContext> | undefined;

    const Probe = defineComponent({
      setup() {
        ctx = useAppContext();
        return () => h('div');
      },
    });

    await mountSuspended(Probe);

    expect(ctx).toBeDefined();
    expect(Object.keys(ctx ?? {})).toEqual([
      'user',
      'org',
      'features',
      'commandPaletteOpen',
      'lastScanId',
    ]);

    expect(ctx?.user.value).toBeNull();
    expect(ctx?.org.value).toBeNull();
    expect(ctx?.features.value).toEqual({});
    expect(ctx?.commandPaletteOpen.value).toBe(false);
    expect(ctx?.lastScanId.value).toBeNull();
  });
});
