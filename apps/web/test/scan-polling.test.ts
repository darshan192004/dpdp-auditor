import { flushPromises } from '@vue/test-utils';
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref, shallowReactive } from 'vue';

import { useScanPolling } from '../app/composables/useScanPolling';
import type { ScanDetail } from '../shared/scan';

const SCAN_ID = '0f000000-0000-4000-8000-000000000012';

const { fetchState } = vi.hoisted(() => ({
  fetchState: {
    data: { value: null as unknown, __v_isRef: true },
    status: { value: 'success', __v_isRef: true },
    error: { value: null as unknown, __v_isRef: true },
    refresh: vi.fn(),
  },
}));

mockNuxtImport('useFetch', () => () => fetchState);

let api: ReturnType<typeof useScanPolling> | undefined;
let wrapper: Awaited<ReturnType<typeof mountSuspended>> | undefined;

// eslint-disable-next-line vue/one-component-per-file
const Harness = defineComponent({
  setup() {
    api = useScanPolling(ref(SCAN_ID));
    return () => h('div', api?.scan.value?.status ?? 'none');
  },
});

function scanWith(status: ScanDetail['status']): { data: ScanDetail } {
  return {
    data: {
      id: SCAN_ID,
      repository: { id: 'repo_1', fullName: 'acme/payments-service', visibility: 'private' },
      status,
      ref: 'main',
      commitSha: null,
      score: null,
      grade: null,
      previousScore: null,
      sectionScores: {},
      counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
      coverage: {},
      scannerVersions: {},
      rulePackVersion: null,
      scoringVersion: null,
      error: null,
      timestamps: {
        queuedAt: '2026-11-07T14:20:05.118Z',
        startedAt: null,
        completedAt: null,
        durationMs: null,
      },
      links: { findings: '', events: '', report: '' },
    },
  };
}

let visibility: DocumentVisibilityState = 'visible';

beforeEach(() => {
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  });
  fetchState.data = shallowReactive({ ...fetchState.data, value: scanWith('scanning') });
  fetchState.status.value = 'success';
  fetchState.error = shallowReactive({ ...fetchState.error, value: null });
  fetchState.refresh.mockReset();
  fetchState.refresh.mockResolvedValue(undefined);
  api = undefined;
  wrapper = undefined;
  vi.useFakeTimers();
});

afterEach(() => {
  wrapper?.unmount();
  vi.useRealTimers();
});

describe('useScanPolling (docs/design.md §7.3)', () => {
  it('polls every two seconds while the scan is active', async () => {
    wrapper = await mountSuspended(Harness);

    expect(fetchState.refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1999);
    await flushPromises();
    expect(fetchState.refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    await flushPromises();
    expect(fetchState.refresh).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000);
    await flushPromises();
    expect(fetchState.refresh).toHaveBeenCalledTimes(2);
  });

  it('stops as soon as the scan reaches a terminal status', async () => {
    fetchState.data.value = scanWith('completed');
    wrapper = await mountSuspended(Harness);

    vi.advanceTimersByTime(5000);
    await flushPromises();

    expect(fetchState.refresh).not.toHaveBeenCalled();
    expect(api?.isTerminal.value).toBe(true);
  });

  it('backs off after consecutive failures and surfaces an inline error', async () => {
    fetchState.refresh.mockRejectedValue(new Error('offline'));
    wrapper = await mountSuspended(Harness);

    vi.advanceTimersByTime(2000);
    await flushPromises();
    expect(fetchState.refresh).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(3999);
    await flushPromises();
    expect(fetchState.refresh).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await flushPromises();
    expect(fetchState.refresh).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(8000);
    await flushPromises();
    expect(fetchState.refresh).toHaveBeenCalledTimes(3);
    expect(api?.pollError.value).not.toBeNull();
  });

  it('backs off when Nuxt refresh resolves with an error ref', async () => {
    fetchState.refresh.mockImplementation(async () => {
      fetchState.error.value = new Error('offline');
    });
    wrapper = await mountSuspended(Harness);
    vi.advanceTimersByTime(2000);
    await flushPromises();
    expect(api?.failures.value).toBe(1);
    vi.advanceTimersByTime(3999);
    await flushPromises();
    expect(fetchState.refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    await flushPromises();
    expect(api?.failures.value).toBe(2);
  });

  it('does not call callbacks or restart polling when an in-flight refresh completes after unmount', async () => {
    let finish: (() => void) | undefined;
    fetchState.refresh.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const onTick = vi.fn();
    // eslint-disable-next-line vue/one-component-per-file
    const PendingHarness = defineComponent({
      setup() {
        api = useScanPolling(ref(SCAN_ID), { onTick });
        return () => h('div');
      },
    });
    wrapper = await mountSuspended(PendingHarness);
    vi.advanceTimersByTime(2000);
    await flushPromises();
    wrapper.unmount();
    wrapper = undefined;
    finish?.();
    await flushPromises();
    vi.advanceTimersByTime(20_000);
    await flushPromises();
    expect(fetchState.refresh).toHaveBeenCalledTimes(1);
    expect(onTick).not.toHaveBeenCalled();
  });

  it('pauses while the tab is hidden and resumes when it is visible again', async () => {
    wrapper = await mountSuspended(Harness);

    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(5000);
    await flushPromises();
    expect(fetchState.refresh).not.toHaveBeenCalled();

    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(2000);
    await flushPromises();
    expect(fetchState.refresh).toHaveBeenCalledTimes(1);
  });

  it('clears the inline error on a manual retry', async () => {
    fetchState.refresh.mockRejectedValue(new Error('offline'));
    wrapper = await mountSuspended(Harness);

    vi.advanceTimersByTime(2000);
    await flushPromises();
    vi.advanceTimersByTime(4000);
    await flushPromises();
    vi.advanceTimersByTime(8000);
    await flushPromises();

    expect(api?.pollError.value).not.toBeNull();

    fetchState.refresh.mockResolvedValue(undefined);
    await api?.retry();
    await flushPromises();

    expect(api?.pollError.value).toBeNull();
    expect(api?.failures.value).toBe(0);
  });

  it('calls onTick after every successful refresh', async () => {
    const onTick = vi.fn();
    // eslint-disable-next-line vue/one-component-per-file
    const HarnessWithHook = defineComponent({
      setup() {
        api = useScanPolling(ref(SCAN_ID), { onTick });
        return () => h('div', api?.scan.value?.status ?? 'none');
      },
    });

    wrapper = await mountSuspended(HarnessWithHook);

    vi.advanceTimersByTime(2000);
    await flushPromises();
    expect(fetchState.refresh).toHaveBeenCalledTimes(1);
    expect(onTick).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000);
    await flushPromises();
    expect(fetchState.refresh).toHaveBeenCalledTimes(2);
    expect(onTick).toHaveBeenCalledTimes(2);
  });

  it('refreshes sibling data on the successful terminal poll and then stops', async () => {
    const onTick = vi.fn();
    fetchState.refresh.mockImplementation(async () => {
      fetchState.data.value = scanWith('completed');
    });
    // eslint-disable-next-line vue/one-component-per-file
    const TerminalHarness = defineComponent({
      setup() {
        api = useScanPolling(ref(SCAN_ID), { onTick });
        return () => h('div');
      },
    });
    wrapper = await mountSuspended(TerminalHarness);
    vi.advanceTimersByTime(2000);
    await flushPromises();
    expect(onTick).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(20_000);
    await flushPromises();
    expect(fetchState.refresh).toHaveBeenCalledTimes(1);
  });

  it('does not call onTick when a refresh fails', async () => {
    const onTick = vi.fn();
    fetchState.refresh.mockImplementation(async () => {
      fetchState.error.value = new Error('offline');
    });

    // eslint-disable-next-line vue/one-component-per-file
    const HarnessWithHook = defineComponent({
      setup() {
        api = useScanPolling(ref(SCAN_ID), { onTick });
        return () => h('div', api?.scan.value?.status ?? 'none');
      },
    });

    wrapper = await mountSuspended(HarnessWithHook);

    vi.advanceTimersByTime(2000);
    await flushPromises();
    expect(fetchState.refresh).toHaveBeenCalledTimes(1);
    expect(onTick).not.toHaveBeenCalled();
  });
});
