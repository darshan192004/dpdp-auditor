import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it, vi } from 'vitest';
import HealthPage from '../app/pages/health.vue';
import type { HealthStatus } from '../app/types/health';
import { formatHealth, formatUptime } from '../app/utils/formatHealth';
import { buildHealthStatus } from '../server/utils/health';

// The page's data source is mocked so both states can be rendered hermetically
// (design §8: every surface defines loading and success explicitly).
const { healthData, healthStatus } = vi.hoisted(() => ({
  // `__v_isRef` so Vue's template unwrapping treats these like real refs.
  healthData: { value: null as unknown, __v_isRef: true },
  healthStatus: { value: 'pending', __v_isRef: true },
}));

mockNuxtImport('useFetch', () => () => ({
  data: healthData,
  status: healthStatus,
  error: { value: null },
  refresh: vi.fn(),
}));

const FIXTURE: HealthStatus = {
  status: 'ok',
  version: '0.1.0',
  uptimeSeconds: 3671,
  timestamp: '2026-11-09T00:00:00.000Z',
};

describe('GET /api/health payload', () => {
  it('matches the contract exactly', () => {
    const res = buildHealthStatus(new Date('2026-11-09T00:00:00.000Z'), 3671.4);

    expect(Object.keys(res)).toEqual(['status', 'version', 'uptimeSeconds', 'timestamp']);
    expect(res.status).toBe('ok');
    expect(res.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(res.uptimeSeconds).toBe(3671);
    expect(res.timestamp).toBe('2026-11-09T00:00:00.000Z');
  });

  it('defaults to a live process uptime and an ISO timestamp', () => {
    const res = buildHealthStatus();

    expect(res.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(res.timestamp).toBe(new Date(res.timestamp).toISOString());
  });
});

describe('health page states (design §8)', () => {
  it('shows an aria-busy skeleton while the request is pending', async () => {
    healthData.value = null;
    healthStatus.value = 'pending';

    const wrapper = await mountSuspended(HealthPage);

    const busy = wrapper.find('[aria-busy="true"]');
    expect(busy.exists()).toBe(true);
    expect(busy.text()).toContain('Loading system status');
    expect(wrapper.find('h1').exists()).toBe(false);
  });

  it('renders the resolved status, version and uptime once loaded', async () => {
    healthData.value = FIXTURE;
    healthStatus.value = 'success';

    const wrapper = await mountSuspended(HealthPage);

    const headings = wrapper.findAll('h1');
    expect(headings).toHaveLength(1);
    expect(headings[0]?.text()).toBe('System status');

    const text = wrapper.text();
    expect(text).toContain('All systems operational');
    expect(text).toContain('0.1.0');

    // Version and uptime are rendered in a fixed-width face (plan Task 5).
    expect(wrapper.find('.font-mono').exists()).toBe(true);
    expect(wrapper.find('[aria-busy="true"]').exists()).toBe(false);
  });
});

describe('formatHealth (pure view model)', () => {
  it('maps a payload to calm copy with no banned words', () => {
    const view = formatHealth(FIXTURE);

    expect(view.title).toBe('System status');
    expect(view.summary).toBe('All systems operational');
    expect(view.version).toBe('Version 0.1.0');
    expect(view.uptime).toBe('Uptime 1h 1m');

    const banned = ['ai-powered', 'seamless', 'revolutionary', 'leverage'];
    for (const word of banned) {
      expect(`${view.title} ${view.summary}`.toLowerCase()).not.toContain(word);
    }
  });

  it('formats uptime at each magnitude', () => {
    expect(formatUptime(0)).toBe('0s');
    expect(formatUptime(45)).toBe('45s');
    expect(formatUptime(600)).toBe('10m 0s');
    expect(formatUptime(3671)).toBe('1h 1m');
    expect(formatUptime(90_000)).toBe('1d 1h');
  });
});
