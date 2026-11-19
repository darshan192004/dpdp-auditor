import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import ApiKeysPage from '../app/pages/app/settings/api-keys/index.vue';

const { keysData, keysStatus, keysError } = vi.hoisted(() => ({
  keysData: { value: null as unknown, __v_isRef: true },
  keysStatus: { value: 'success', __v_isRef: true },
  keysError: { value: null as unknown, __v_isRef: true },
}));

mockNuxtImport('useFetch', () => () => ({
  data: keysData,
  status: keysStatus,
  error: keysError,
  refresh: () => Promise.resolve(),
}));

type Wrapper = Awaited<ReturnType<typeof mountSuspended>>;
let wrapper: Wrapper | undefined;

beforeEach(() => {
  keysData.value = { data: [] };
  keysStatus.value = 'success';
  keysError.value = null;
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});

async function renderPage(): Promise<Wrapper> {
  wrapper = await mountSuspended(ApiKeysPage, { attachTo: document.body });
  await nextTick();
  return wrapper;
}

async function openDialog(): Promise<HTMLElement> {
  const trigger = wrapper!
    .findAll('button')
    .find((button) => button.text().trim() === 'Create API key');
  if (!trigger) throw new Error('Create API key trigger not found');

  (trigger.element as HTMLElement).focus();
  await trigger.trigger('click');
  await nextTick();
  await nextTick();
  return trigger.element as HTMLElement;
}

function dialog(): ReturnType<Wrapper['find']> {
  const found = wrapper!.find('[role="dialog"]');
  if (!found.exists()) throw new Error('dialog is not rendered');
  return found;
}

function keydown(key: string, shiftKey = false): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
}

describe('Create API key dialog keyboard behaviour', () => {
  it('moves focus into the dialog and exposes an explicit close control', async () => {
    await renderPage();
    await openDialog();

    expect(dialog().attributes('aria-modal')).toBe('true');
    expect(dialog().attributes('aria-labelledby')).toBe('create-key-heading');
    expect(dialog().find('button[aria-label="Close dialog"]').exists()).toBe(true);

    const heading = dialog().find('#create-key-heading');
    expect(heading.attributes('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(heading.element);
  });

  it('traps Tab within the dialog in both directions', async () => {
    await renderPage();
    await openDialog();

    const heading = dialog().find('#create-key-heading').element as HTMLElement;
    const cancel = dialog()
      .findAll('button')
      .find((button) => button.text().trim() === 'Cancel')!.element as HTMLElement;

    heading.focus();
    const backwards = keydown('Tab', true);
    window.dispatchEvent(backwards);
    expect(backwards.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(cancel);

    cancel.focus();
    const forwards = keydown('Tab');
    window.dispatchEvent(forwards);
    expect(forwards.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(heading);
  });

  it('closes on Escape and restores focus to the trigger', async () => {
    await renderPage();
    const trigger = await openDialog();

    window.dispatchEvent(keydown('Escape'));
    await nextTick();
    await nextTick();

    expect(wrapper!.find('[role="dialog"]').exists()).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('closes via the close button and restores focus to the trigger', async () => {
    await renderPage();
    const trigger = await openDialog();

    await dialog().find('button[aria-label="Close dialog"]').trigger('click');
    await nextTick();
    await nextTick();

    expect(wrapper!.find('[role="dialog"]').exists()).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });
});
