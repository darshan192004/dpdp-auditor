import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import IndexPage from '../app/pages/index.vue';

// Copy rules from docs/design.md §13 — banned marketing words must never appear.
const BANNED_WORDS = ['ai-powered', 'seamless', 'revolutionary', 'leverage'];

describe('landing page', () => {
  it('renders exactly one h1 with the product name', async () => {
    const wrapper = await mountSuspended(IndexPage);
    const headings = wrapper.findAll('h1');
    expect(headings).toHaveLength(1);
    expect(headings[0]?.text()).toContain('DPDPA GitHub Code Auditor');
  });

  it('follows the copy rules (no banned marketing words)', async () => {
    const wrapper = await mountSuspended(IndexPage);
    const text = wrapper.text().toLowerCase();
    for (const word of BANNED_WORDS) {
      expect(text).not.toContain(word);
    }
  });

  it('links to the app dashboard', async () => {
    const wrapper = await mountSuspended(IndexPage);
    const link = wrapper.find('a[href="/app"]');
    expect(link.exists()).toBe(true);
  });
});
