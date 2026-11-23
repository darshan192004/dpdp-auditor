import { mountSuspended } from '@nuxt/test-utils/runtime';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';

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

function form(overrides: Record<string, unknown> = {}, mountOptions: Record<string, unknown> = {}) {
  return mountSuspended(ScanSubmitForm, {
    props: { repos: REPOS, quota: { used: 2, limit: 10 }, ...overrides },
    ...mountOptions,
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

  it('clears the repository ref when switching back to a URL', async () => {
    const wrapper = await form();
    await wrapper.find('select#scan-repo').setValue(REPOS[1]!.id);
    expect((wrapper.find('input#scan-ref').element as HTMLInputElement).value).toBe('develop');
    await wrapper.find('input#scan-url').setValue('https://github.com/acme/public');
    await submit(wrapper);
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      githubUrl: 'https://github.com/acme/public',
    });
    expect(wrapper.emitted('submit')?.[0]?.[0]).not.toHaveProperty('ref');
    expect(wrapper.emitted('submit')?.[0]?.[0]).not.toHaveProperty('repositoryId');
  });

  it('awaits submission and displays request failures without an unhandled rejection', async () => {
    const submitRequest = vi.fn().mockRejectedValue(new Error('Monthly scan quota exceeded.'));
    const wrapper = await form({ submitRequest });
    await wrapper.find('input#scan-url').setValue('https://github.com/acme/public');
    await submit(wrapper);
    await flushPromises();
    expect(submitRequest).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[role="alert"]').text()).toContain('Monthly scan quota exceeded.');
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined();
  });

  it('disables submit when the scan limit is reached and links to scan settings', async () => {
    const wrapper = await form({ quota: { used: 10, limit: 10 } });

    expect(wrapper.text()).toContain('10 of 10 scans used');
    expect(wrapper.find('a[href="/app/settings/org"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/app/settings/billing"]').exists()).toBe(false);

    const button = wrapper.find('button[type="submit"]');
    expect(button.attributes('disabled')).toBeDefined();
  });

  it('does not submit while the role cannot start scans', async () => {
    const wrapper = await form({ canSubmit: false });

    await wrapper.find('input#scan-url').setValue('https://github.com/acme/payments-service');
    const button = wrapper.find('button[type="submit"]');
    expect(button.attributes('disabled')).toBeDefined();
  });

  it('explains an empty submit inline instead of showing the raw contract message', async () => {
    const wrapper = await form();
    await submit(wrapper);

    expect(wrapper.emitted('submit')).toBeUndefined();

    const url = wrapper.find('input#scan-url');
    const repo = wrapper.find('select#scan-repo');
    expect(url.attributes('aria-invalid')).toBe('true');
    expect(repo.attributes('aria-invalid')).toBe('true');
    expect(url.attributes('aria-describedby')).toContain('scan-source-error');
    expect(repo.attributes('aria-describedby')).toContain('scan-source-error');

    const inline = wrapper.find('#scan-source-error');
    expect(inline.exists()).toBe(true);
    expect(inline.attributes('role')).toBe('alert');
    expect(inline.text()).toMatch(/choose a saved repository or paste a GitHub URL/i);
    expect(inline.text()).not.toMatch(/repositoryId|githubUrl/);
    expect(wrapper.text()).not.toContain('Provide exactly one of repositoryId or githubUrl.');
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(1);
  });

  it('moves focus to the URL field on an empty submit', async () => {
    const wrapper = await form({}, { attachTo: document.body });
    await submit(wrapper);
    await nextTick();

    expect(document.activeElement).toBe(wrapper.find('input#scan-url').element);
    wrapper.unmount();
  });

  it('moves focus to the ref field when the ref is invalid', async () => {
    const wrapper = await form({}, { attachTo: document.body });
    await wrapper.find('input#scan-url').setValue('https://github.com/acme/payments-service');
    await wrapper.find('input#scan-ref').setValue('bad ref');
    await submit(wrapper);
    await nextTick();

    const refInput = wrapper.find('input#scan-ref');
    expect(document.activeElement).toBe(refInput.element);
    expect(refInput.attributes('aria-invalid')).toBe('true');
    expect(refInput.attributes('aria-describedby')).toContain('scan-ref-error');
    expect(wrapper.find('#scan-ref-error').text()).toBe(
      'Enter a valid branch, tag, or commit SHA.',
    );
    wrapper.unmount();
  });

  it('clears the inline source error when a saved repository is chosen', async () => {
    const wrapper = await form();
    await submit(wrapper);
    expect(wrapper.find('#scan-source-error').exists()).toBe(true);

    await wrapper.find('select#scan-repo').setValue(REPOS[0]!.id);
    await nextTick();

    expect(wrapper.find('#scan-source-error').exists()).toBe(false);
    expect(wrapper.find('input#scan-url').attributes('aria-invalid')).toBeUndefined();
    expect(wrapper.find('select#scan-repo').attributes('aria-invalid')).toBeUndefined();

    await submit(wrapper);
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      repositoryId: REPOS[0]!.id,
      profile: 'standard',
    });
  });

  it('clears the inline source error when a URL is pasted', async () => {
    const wrapper = await form();
    await submit(wrapper);

    const url = wrapper.find('input#scan-url');
    await url.setValue('https://github.com/acme/payments-service');
    await nextTick();

    expect(wrapper.find('#scan-source-error').exists()).toBe(false);
    expect(url.attributes('aria-invalid')).toBeUndefined();
    expect(url.attributes('aria-describedby')).toContain('scan-url-help');
    expect(url.attributes('aria-describedby')).not.toContain('scan-source-error');
  });

  it('associates an invalid URL error with the URL field', async () => {
    const wrapper = await form();
    await wrapper.find('input#scan-url').setValue('https://gitlab.com/acme/x');
    await submit(wrapper);

    const url = wrapper.find('input#scan-url');
    expect(url.attributes('aria-invalid')).toBe('true');
    expect(url.attributes('aria-describedby')).toContain('scan-url-error');
    expect(wrapper.find('#scan-url-error').attributes('role')).toBe('alert');
    expect(wrapper.find('[role="alert"]').text()).toContain('GitHub repository URL');
  });
});
