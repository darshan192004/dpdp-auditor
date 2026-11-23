import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime';
import { flushPromises } from '@vue/test-utils';
import { computed, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ScanListPage from '../app/pages/app/scans/index.vue';
import { fixtureScanList, FIXTURE_SCANS } from '../server/utils/fixtures/scans';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}));
mockNuxtImport('useFetch', () => mocks.fetch);
vi.mock('../app/composables/useAppContext', () => ({
  useAppContext: () => ({ user: { value: null }, org: { value: { role: 'viewer' } } }),
}));

const source = Array.from({ length: 30 }, (_, index) => ({
  ...structuredClone(FIXTURE_SCANS[0]!),
  id: `scan-${index}`,
  status: index < 5 ? ('failed' as const) : ('completed' as const),
}));
beforeEach(() => {
  mocks.fetch.mockImplementation(async (url: string | (() => string)) => ({
    data: computed(() => {
      const path = typeof url === 'function' ? url() : url;
      if (path === '/api/v1/repos') return { data: { items: [] } };
      if (path === '/api/v1/org/summary')
        return { data: { scansUsedThisMonth: 2, scansPerMonth: 10 } };
      const query = Object.fromEntries(new URL(path, 'http://test').searchParams);
      return { data: fixtureScanList(query, source) };
    }),
    status: ref('success'),
    error: ref(null),
    refresh: vi.fn(),
  }));
});

afterEach(() => vi.restoreAllMocks());

describe('scan list route state', () => {
  it('restores page two from a bookmark and resets to page one when the status changes', async () => {
    const wrapper = await mountSuspended(ScanListPage, { route: '/?page=2' });
    const push = vi.spyOn(wrapper.vm.$router, 'push');
    expect(wrapper.get('button[aria-current="page"]').text()).toBe('2');
    expect(wrapper.findAll('tbody tr')).toHaveLength(5);
    await wrapper.find('button[data-status-filter="failed"]').trigger('click');
    await flushPromises();
    await vi.waitFor(() =>
      expect(wrapper.vm.$router.currentRoute.value.query).toEqual({ status: 'failed' }),
    );
    expect(wrapper.findAll('tbody tr')).toHaveLength(5);
    expect(wrapper.findAll('tbody tr').every((row) => row.text().includes('Failed'))).toBe(true);
    expect(push).toHaveBeenCalledWith({ query: { page: undefined, status: 'failed' } });
    expect(wrapper.vm.$router.currentRoute.value.query).toEqual({ status: 'failed' });
    expect(wrapper.find('button[data-status-filter="failed"]').attributes('aria-pressed')).toBe(
      'true',
    );
    wrapper.unmount();
  });
  it('recovers an out-of-range bookmark to the last populated page', async () => {
    const wrapper = await mountSuspended(ScanListPage, { route: '/?page=3&source=bookmark' });
    await flushPromises();
    await vi.waitFor(() =>
      expect(wrapper.vm.$router.currentRoute.value.query).toEqual({
        page: '2',
        source: 'bookmark',
      }),
    );
    expect(wrapper.findAll('tbody tr')).toHaveLength(5);
    expect(wrapper.get('button[aria-current="page"]').text()).toBe('2');
    expect(wrapper.text()).not.toContain('No scans yet');
    const previous = wrapper.get('button[data-page="1"]');
    expect(previous?.attributes('disabled')).toBeUndefined();
    await previous?.trigger('click');
    await flushPromises();
    await vi.waitFor(() => expect(wrapper.findAll('tbody tr')).toHaveLength(25));
    wrapper.unmount();
  });

  it('recovers to page one when a filter has only one page or no matches', async () => {
    for (const status of ['failed', 'cancelled']) {
      const wrapper = await mountSuspended(ScanListPage, { route: `/?status=${status}&page=999` });
      await flushPromises();
      await vi.waitFor(() =>
        expect(wrapper.vm.$router.currentRoute.value.query).toEqual({ status }),
      );
      expect(wrapper.findAll('tbody tr')).toHaveLength(status === 'failed' ? 5 : 0);
      expect(wrapper.text().includes('No scans yet')).toBe(status === 'cancelled');
      wrapper.unmount();
    }
  });

  it('restores a valid status and falls back safely for invalid route values', async () => {
    const filtered = await mountSuspended(ScanListPage, { route: '/?status=failed' });
    expect(filtered.findAll('tbody tr')).toHaveLength(5);
    filtered.unmount();
    const invalid = await mountSuspended(ScanListPage, { route: '/?status=bogus&page=-2' });
    expect(invalid.get('button[aria-current="page"]').text()).toBe('1');
    expect(invalid.findAll('tbody tr')).toHaveLength(25);
    invalid.unmount();
  });
});
