import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import ScanSubmitForm from '../app/components/scan/ScanSubmitForm.vue';
import type { SavedRepoView } from '../shared/repo';

const REPOS: SavedRepoView[] = [
  {
    id: '3f000000-0000-4000-8000-000000000001',
    fullName: 'acme/payments-service',
    defaultBranch: 'main',
    visibility: 'private',
    connectedAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: '3f000000-0000-4000-8000-000000000002',
    fullName: 'acme/checkout-web',
    defaultBranch: 'develop',
    visibility: 'public',
    connectedAt: '2026-11-02T00:00:00.000Z',
  },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function form(overrides: Record<string, unknown> = {}) {
  return mountSuspended(ScanSubmitForm, {
    props: { repos: REPOS, quota: { used: 2, limit: 10 }, ...overrides },
  });
}

async function submit(wrapper: Awaited<ReturnType<typeof form>>) {
  await wrapper.find('form').trigger('submit');
}

describe('ScanSubmitForm (docs/design.md §5.5)', () => {
  it('labels the URL, ref, and profile fields', async () => {
    const wrapper = await form();

    expect(wrapper.find('input#scan-url').exists()).toBe(true);
    expect(wrapper.find('label[for="scan-url"]').exists()).toBe(true);
    expect(wrapper.find('input#scan-ref').exists()).toBe(true);
    expect(wrapper.find('label[for="scan-ref"]').exists()).toBe(true);

    const profiles = wrapper.findAll('input[type="radio"][name="profile"]');
    expect(profiles).toHaveLength(2);
    expect(wrapper.findAll('label').some((label) => label.text() === 'Standard')).toBe(true);
    expect(wrapper.findAll('label').some((label) => label.text() === 'Secrets only')).toBe(true);
  });

  it('submits the pasted URL with the chosen ref and profile plus an idempotency key', async () => {
    const wrapper = await form();

    await wrapper.find('input#scan-url').setValue('https://github.com/acme/payments-service');
    await wrapper.find('input#scan-ref').setValue('release-2026.11');
    await wrapper.find('input[value="secrets-only"]').setValue();
    await submit(wrapper);

    const payload = wrapper.emitted('submit')?.[0]?.[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      githubUrl: 'https://github.com/acme/payments-service',
      ref: 'release-2026.11',
      profile: 'secrets-only',
    });
    expect(payload.idempotencyKey).toMatch(UUID);
  });

  it('reuses the same idempotency key when the form is retried', async () => {
    const wrapper = await form();

    await wrapper.find('input#scan-url').setValue('https://github.com/acme/payments-service');
    await submit(wrapper);
    await submit(wrapper);

    const keys = wrapper
      .emitted('submit')
      ?.map((call) => (call[0] as { idempotencyKey: string }).idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys?.[0]).toBe(keys?.[1]);
  });

  it('rejects a non-GitHub URL before hitting the API', async () => {
    const wrapper = await form();

    await wrapper.find('input#scan-url').setValue('https://gitlab.com/acme/x');
    await submit(wrapper);

    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.find('[role="alert"]').text()).toContain('GitHub repository URL');
  });

  it('submits a saved repository id instead of the URL', async () => {
    const wrapper = await form();

    await wrapper.find('input#scan-url').setValue('https://github.com/leftover/repo');
    await wrapper.find('select#scan-repo').setValue(REPOS[0]!.id);
    await submit(wrapper);

    const payload = wrapper.emitted('submit')?.[0]?.[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      repositoryId: REPOS[0]!.id,
      profile: 'standard',
    });
    expect(payload).not.toHaveProperty('githubUrl');
  });

  it('disables submit when the quota is exhausted and links to billing', async () => {
    const wrapper = await form({ quota: { used: 10, limit: 10 } });

    expect(wrapper.text()).toContain('10 of 10 scans used');
    expect(wrapper.find('a[href="/app/settings/billing"]').exists()).toBe(true);

    const button = wrapper.find('button[type="submit"]');
    expect(button.attributes('disabled')).toBeDefined();
  });

  it('does not submit while the role cannot start scans', async () => {
    const wrapper = await form({ canSubmit: false });

    await wrapper.find('input#scan-url').setValue('https://github.com/acme/payments-service');
    const button = wrapper.find('button[type="submit"]');
    expect(button.attributes('disabled')).toBeDefined();
  });
});
