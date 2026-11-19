import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import StartScanDrawer from '../app/components/dashboard/StartScanDrawer.vue';
import type { SavedRepoView } from '../shared/repo';

const REPOS: SavedRepoView[] = [
  {
    id: 'repo_1',
    fullName: 'acme/repo',
    defaultBranch: 'main',
    visibility: 'public',
    connectedAt: '2026-11-01T00:00:00Z',
  },
];

describe('start-scan flow', () => {
  it('hosts the restored ScanSubmitForm and forwards its payload', async () => {
    const wrapper = await mountSuspended(StartScanDrawer, {
      props: { open: true, repos: REPOS, quota: { used: 1, limit: 10 }, submitting: false },
    });
    expect(wrapper.find('form').exists()).toBe(true);
    expect(wrapper.text()).toContain('Start a scan');
    await wrapper.find('input#scan-url').setValue('https://github.com/acme/repo');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      githubUrl: 'https://github.com/acme/repo',
      profile: 'standard',
    });
  });
});
