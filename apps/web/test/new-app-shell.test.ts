import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import NewAppShell from '../app/components/shell/NewAppShell.vue';

describe('NewAppShell', () => {
  it('renders breadcrumb nav, main landmark, and toast host', async () => {
    const wrapper = await mountSuspended(NewAppShell);
    expect(wrapper.find('nav[aria-label="Breadcrumb"]').exists()).toBe(true);
    expect(wrapper.find('main#main').exists()).toBe(true);
    expect(wrapper.find('[aria-live="polite"]').exists()).toBe(true);
  });
});
