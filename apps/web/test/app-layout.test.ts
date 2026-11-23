import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';

import NewAppShell from '../app/components/shell/NewAppShell.vue';
import PrintLayout from '../app/layouts/print.vue';

const FOCUSABLE = 'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

function mountAppShell() {
  const TestPage = defineComponent({
    setup() {
      return () =>
        h(NewAppShell, null, {
          default: () => h('h1', null, 'Overview'),
        });
    },
  });

  return mountSuspended(TestPage);
}

describe('flag-free app entry (docs/design.md §3.1, §3.3)', () => {
  it('renders the new shell without a runtime flag or legacy layout fallback', () => {
    const appSource = readFileSync(resolve(process.cwd(), 'app/app.vue'), 'utf8');
    const configSource = readFileSync(resolve(process.cwd(), 'nuxt.config.ts'), 'utf8');

    expect(appSource).toContain('<NewAppShell');
    expect(appSource).not.toMatch(/newUi|NuxtLayout/);
    expect(configSource).not.toMatch(/newUi|NUXT_PUBLIC_NEW_UI/);
  });

  it('keeps auth, print and default layouts for pages that opt out of console chrome', () => {
    const appSource = readFileSync(resolve(process.cwd(), 'app/app.vue'), 'utf8');

    expect(appSource).toContain("standaloneLayout === 'auth'");
    expect(appSource).toContain("standaloneLayout === 'print'");
    expect(appSource).toContain("standaloneLayout === 'default'");
    expect(appSource).toContain('<AuthLayout');
    expect(appSource).toContain('<PrintLayout');
  });
});

describe('Signal Console shell (docs/design.md §3.1, §9)', () => {
  it('puts the skip link first in focus order', async () => {
    const wrapper = await mountAppShell();
    const first = wrapper.findAll(FOCUSABLE)[0];

    expect(first.exists()).toBe(true);
    expect(first.element.tagName).toBe('A');
    expect(first.attributes('href')).toBe('#main');
    expect(first.text()).toBe('Skip to content');
  });

  it('renders header, primary nav, breadcrumb nav, main and aside landmarks', async () => {
    const wrapper = await mountAppShell();

    expect(wrapper.find('header').exists()).toBe(true);
    expect(wrapper.find('nav[aria-label="Primary"]').exists()).toBe(true);
    expect(wrapper.find('nav[aria-label="Breadcrumb"]').exists()).toBe(true);
    expect(wrapper.find('main#main').exists()).toBe(true);
    expect(wrapper.find('aside').exists()).toBe(true);
  });

  it('renders the toast host as a polite live region', async () => {
    const wrapper = await mountAppShell();
    const host = wrapper.find('[role="status"][aria-live="polite"]');

    expect(host.exists()).toBe(true);
  });

  it('renders exactly one h1 from the page slot', async () => {
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
