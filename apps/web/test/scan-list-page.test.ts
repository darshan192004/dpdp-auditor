import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime';
import { flushPromises } from '@vue/test-utils';
import { computed, reactive, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ScanListPage from '../app/pages/app/scans/index.vue';
import { fixtureScanList, FIXTURE_SCANS } from '../server/utils/fixtures/scans';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  route: { query: {} as Record<string, string | undefined> },
}));
mockNuxtImport('useFetch', () => mocks.fetch);
mockNuxtImport('useRoute', () => () => mocks.route);
mockNuxtImport('useRouter', () => () => ({
  push: async (location: { query: Record<string, string | undefined> }) => {
    mocks.route.query = Object.fromEntries(
      Object.entries(location.query).filter(([, value]) => value !== undefined),
    );
  },
}));
vi.mock('../app/composables/useAppContext', () => ({
  useAppContext: () => ({ org: { value: { role: 'viewer' } } }),
}));

const source = Array.from({ length: 25 }, (_, index) => ({
  ...structuredClone(FIXTURE_SCANS[0]!),
  id: `scan-${index}`,
  status: index < 5 ? ('failed' as const) : ('completed' as const),
}));
beforeEach(() => {
  mocks.route = reactive({ query: {} as Record<string, string | undefined> });
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

describe('scan list route state', () => {
  it('restores page two from a bookmark and resets to page one when the status changes', async () => {
    mocks.route.query = { page: '2' };
    const wrapper = await mountSuspended(ScanListPage);
    expect(wrapper.text()).toContain('Page 2 of 2');
    expect(wrapper.findAll('tbody tr')).toHaveLength(5);
    await wrapper.find('input[type="radio"][value="failed"]').setValue();
    await flushPromises();
    expect(wrapper.findAll('tbody tr')).toHaveLength(5);
    expect(wrapper.findAll('tbody tr').every((row) => row.text().includes('Failed'))).toBe(true);
    expect(mocks.route.query).toEqual({ status: 'failed' });
    expect(wrapper.find('input[type="radio"][value="failed"]').element).toHaveProperty(
      'checked',
      true,
    );
    wrapper.unmount();
  });
  it('restores a valid status and falls back safely for invalid route values', async () => {
    mocks.route.query = { status: 'failed' };
    const filtered = await mountSuspended(ScanListPage);
    expect(filtered.findAll('tbody tr')).toHaveLength(5);
    filtered.unmount();
    mocks.route.query = { status: 'bogus', page: '-2' };
    const invalid = await mountSuspended(ScanListPage);
    expect(invalid.text()).toContain('Page 1 of 2');
    expect(invalid.findAll('tbody tr')).toHaveLength(20);
    invalid.unmount();
  });
});
