import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ReposPage from '../app/pages/app/repos/index.vue';
import type { RepoListView } from '../shared/repo';

const { resolver, reposData, reposStatus, reposError } = vi.hoisted(() => ({
  resolver: vi.fn(),
  reposData: {
    value: { data: { items: [], pagination: {} } } as unknown,
    __v_isRef: true,
  },
  reposStatus: { value: 'success', __v_isRef: true },
  reposError: { value: null as unknown, __v_isRef: true },
}));

mockNuxtImport('useFetch', () => () => ({
  data: reposData,
  status: reposStatus,
  error: reposError,
  refresh: () => Promise.resolve(),
}));

mockNuxtImport('$fetch', () => resolver);

vi.mock('../app/composables/useAppContext', () => ({
  useAppContext: () => ({
    org: { value: { id: 'org_1', name: 'Acme', role: 'owner' }, __v_isRef: true },
  }),
}));

type Wrapper = Awaited<ReturnType<typeof mountSuspended>>;
let wrapper: Wrapper | undefined;

beforeEach(() => {
  resolver.mockReset();
  reposData.value = { data: { items: [], pagination: {} } satisfies RepoListView };
  reposStatus.value = 'success';
  reposError.value = null;
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});

async function openForm(): Promise<Wrapper> {
  wrapper = await mountSuspended(ReposPage, { attachTo: document.body });
  await nextTick();
  const trigger = wrapper!
    .findAll('button')
    .find((button) => button.text().trim() === 'Connect repository');
  if (!trigger) throw new Error('Connect repository trigger not found');
  await trigger.trigger('click');
  await nextTick();
  return wrapper!;
}

async function preview(wrapper: Wrapper): Promise<void> {
  const submit = wrapper.findAll('button').find((button) => button.text().trim() === 'Preview');
  if (!submit) throw new Error('Preview button not found');
  await submit.trigger('click');
  await nextTick();
}

describe('Connect repository URL validation', () => {
  it('rejects an invalid GitHub URL inline without calling the resolver', async () => {
    const page = await openForm();
    const input = page.get('#repo-url');
    await input.setValue('https://gitlab.com/acme/payments-service');
    await preview(page);

    expect(resolver).not.toHaveBeenCalled();

    const error = page.find('#repo-url-error');
    expect(error.exists()).toBe(true);
    expect(error.attributes('role')).toBe('alert');
    expect(error.text()).toContain('Enter a valid GitHub repository URL.');

    expect(input.attributes('aria-invalid')).toBe('true');
    expect(input.attributes('aria-describedby')).toContain('repo-url-help');
    expect(input.attributes('aria-describedby')).toContain('repo-url-error');
    expect(document.activeElement).toBe(input.element);
    expect(page.find('p.bg-risk-critical-bg[role="alert"]').exists()).toBe(false);
  });

  it('clears the inline error when the URL is corrected', async () => {
    const page = await openForm();
    const input = page.get('#repo-url');
    await input.setValue('not-a-url');
    await preview(page);
    expect(page.find('#repo-url-error').exists()).toBe(true);

    await input.setValue('https://github.com/acme/payments-service');
    await nextTick();

    expect(page.find('#repo-url-error').exists()).toBe(false);
    expect(input.attributes('aria-invalid')).toBeUndefined();
    expect(input.attributes('aria-describedby')).toBe('repo-url-help');
  });

  it('calls the resolver for a valid GitHub URL', async () => {
    resolver.mockResolvedValueOnce({
      data: {
        fullName: 'acme/payments-service',
        defaultBranch: 'main',
        sizeBytes: 1024,
        visibility: 'public',
        isPublic: true,
      },
    });

    const page = await openForm();
    await page.get('#repo-url').setValue('https://github.com/acme/payments-service');
    await preview(page);

    expect(resolver).toHaveBeenCalledWith('/api/v1/repos/resolve', {
      method: 'POST',
      body: { githubUrl: 'https://github.com/acme/payments-service' },
    });
    expect(page.text()).toContain('acme/payments-service');
    expect(page.find('#repo-url-error').exists()).toBe(false);
  });
});
