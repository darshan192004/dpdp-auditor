import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';

import AppLayout from '../app/layouts/app.vue';
import PrintLayout from '../app/layouts/print.vue';
import PageHeader from '../app/components/shell/PageHeader.vue';
import { APP_NAV } from '../app/utils/nav';

const FOCUSABLE = 'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

function mountAppShell() {
  const TestPage = defineComponent({
    setup() {
      return () =>
        h(AppLayout, null, {
          default: () => h(PageHeader, { title: 'Overview' }),
        });
    },
  });

  return mountSuspended(TestPage);
}

describe('app shell layout (docs/design.md §3.1, §9)', () => {
  it('puts the skip link first in focus order', async () => {
    const wrapper = await mountAppShell();
    const first = wrapper.findAll(FOCUSABLE)[0];

    expect(first.exists()).toBe(true);
    expect(first.element.tagName).toBe('A');
    expect(first.attributes('href')).toBe('#main');
    expect(first.text()).toBe('Skip to content');
  });

  it('renders header, nav, main and aside landmarks', async () => {
    const wrapper = await mountAppShell();

    expect(wrapper.find('header').exists()).toBe(true);
    expect(wrapper.findAll('nav').length).toBeGreaterThan(0);
    expect(wrapper.find('main#main').exists()).toBe(true);
    expect(wrapper.find('aside').exists()).toBe(true);
  });

  it('renders every APP_NAV entry as a link in the sidebar', async () => {
    const wrapper = await mountAppShell();
    const aside = wrapper.find('aside');

    expect(APP_NAV).toHaveLength(6);
    for (const item of APP_NAV) {
      const link = aside.findAll('a').find((candidate) => candidate.text() === item.label);
      expect(link, `missing sidebar link: ${item.label}`).toBeDefined();
      expect(link?.attributes('href')).toBe(item.to);
    }
  });

  it('renders org-switcher and account-menu placeholders in the topbar', async () => {
    const wrapper = await mountAppShell();
    const header = wrapper.find('header');
    const buttons = header.findAll('button');

    const orgSwitcher = buttons.find((button) => /your organisation/i.test(button.text()));
    const accountMenu = buttons.find((button) =>
      /account menu/i.test(button.attributes('aria-label') ?? ''),
    );

    expect(orgSwitcher, 'org switcher placeholder missing').toBeDefined();
    expect(accountMenu, 'account menu placeholder missing').toBeDefined();
  });

  it('renders exactly one h1, provided by PageHeader', async () => {
    const wrapper = await mountAppShell();
    const headings = wrapper.findAll('h1');

    expect(headings).toHaveLength(1);
    expect(headings[0]?.text()).toBe('Overview');
  });
});

describe('print layout (docs/design.md §3.3)', () => {
  it('renders content without header or sidebar chrome', async () => {
    const wrapper = await mountSuspended(PrintLayout);

    expect(wrapper.find('header').exists()).toBe(false);
    expect(wrapper.find('aside').exists()).toBe(false);
  });
});
