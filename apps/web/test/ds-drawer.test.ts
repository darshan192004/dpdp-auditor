import { mountSuspended } from '@nuxt/test-utils/runtime';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';

import DsDrawer from '../app/components/ds/DsDrawer.vue';

describe('DsDrawer keyboard affordance', () => {
  it('names the dialog and focuses the heading on entry', async () => {
    const wrapper = await mountSuspended(DsDrawer, {
      props: { open: true, title: 'Start a scan' },
      slots: { default: '<button type="button">Submit</button>' },
      attachTo: document.body,
    });
    await nextTick();

    const dialog = wrapper.find('[role="dialog"]');
    expect(dialog.attributes('aria-modal')).toBe('true');
    expect(dialog.attributes('aria-label')).toBe('Start a scan');
    expect(wrapper.find('h2').attributes('tabindex')).toBe('-1');
    expect(document.activeElement?.textContent?.trim()).toBe('Start a scan');
  });

  it('closes on Escape and restores focus to the trigger', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open';
    document.body.appendChild(trigger);
    trigger.focus();

    const wrapper = await mountSuspended(DsDrawer, {
      props: { open: true, title: 'Start a scan' },
    });
    await nextTick();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapper.emitted('close')).toHaveLength(1);

    await wrapper.setProps({ open: false });
    await nextTick();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
