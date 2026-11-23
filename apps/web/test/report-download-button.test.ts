import { flushPromises } from '@vue/test-utils';
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DownloadButton from '../app/components/report/DownloadButton.vue';

let wrapper: Awaited<ReturnType<typeof mountSuspended>> | undefined;
const { fetch } = vi.hoisted(() => ({ fetch: vi.fn() }));
mockNuxtImport('$fetch', () => fetch);

beforeEach(() => {
  vi.useFakeTimers();
  fetch.mockReset();
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.useRealTimers();
});

describe('report download polling lifecycle', () => {
  it('aborts a pending create request and cannot start polling after unmount', async () => {
    let finish: ((response: unknown) => void) | undefined;
    fetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    wrapper = await mountSuspended(DownloadButton, { props: { scanId: 'scan_1' } });
    await wrapper.find('button').trigger('click');
    const signal = fetch.mock.calls[0]?.[1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    wrapper.unmount();
    wrapper = undefined;
    expect(signal.aborted).toBe(true);
    // A transport may resolve despite cancellation; disposal must still prevent timers.
    finish?.({ data: { id: 'report_1', status: 'queued' } });
    await flushPromises();
    vi.advanceTimersByTime(120_000);
    await flushPromises();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('aborts a pending status request and cannot restart polling after unmount', async () => {
    let finish: ((response: unknown) => void) | undefined;
    fetch.mockResolvedValueOnce({ data: { id: 'report_1', status: 'queued' } });
    fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    wrapper = await mountSuspended(DownloadButton, { props: { scanId: 'scan_1' } });
    await wrapper.find('button').trigger('click');
    await flushPromises();
    vi.advanceTimersByTime(2000);
    await flushPromises();
    expect(fetch).toHaveBeenCalledTimes(2);
    const signal = fetch.mock.calls[1]?.[1].signal as AbortSignal;
    wrapper.unmount();
    wrapper = undefined;
    expect(signal.aborted).toBe(true);
    finish?.({ data: { status: 'rendering' } });
    await flushPromises();
    vi.advanceTimersByTime(120_000);
    await flushPromises();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('starts a new intent after a confirmed render failure', async () => {
    fetch.mockResolvedValueOnce({ data: { id: 'report_1', status: 'queued' } });
    fetch.mockResolvedValueOnce({ data: { status: 'failed' } });
    fetch.mockResolvedValueOnce({ data: { id: 'report_2', status: 'ready' } });
    wrapper = await mountSuspended(DownloadButton, { props: { scanId: 'scan_1' } });
    await wrapper.find('button').trigger('click');
    await flushPromises();
    const originalKey = fetch.mock.calls[0]?.[1].headers['Idempotency-Key'];
    vi.advanceTimersByTime(2000);
    await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toContain('Rendering failed');
    await wrapper.find('button').trigger('click');
    await flushPromises();
    expect(fetch.mock.calls[2]?.[1].headers['Idempotency-Key']).not.toBe(originalKey);
    expect(wrapper.find('a[href="/api/v1/report/pdf/report_2/download"]').exists()).toBe(true);
  });

  it('retains the key when retrying an uncertain create-request transport failure', async () => {
    fetch.mockRejectedValueOnce(new Error('offline'));
    fetch.mockResolvedValueOnce({ data: { id: 'report_1', status: 'ready' } });
    wrapper = await mountSuspended(DownloadButton, { props: { scanId: 'scan_1' } });
    await wrapper.find('button').trigger('click');
    await flushPromises();
    const originalKey = fetch.mock.calls[0]?.[1].headers['Idempotency-Key'];
    await wrapper.find('button').trigger('click');
    await flushPromises();
    expect(fetch.mock.calls[1]?.[1].headers['Idempotency-Key']).toBe(originalKey);
  });

  it('shows a failed creation response immediately rather than polling it', async () => {
    fetch.mockResolvedValueOnce({ data: { id: 'report_1', status: 'failed' } });
    wrapper = await mountSuspended(DownloadButton, { props: { scanId: 'scan_1' } });
    await wrapper.find('button').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toContain('Rendering failed');
    vi.advanceTimersByTime(120_000);
    await flushPromises();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('continues polling while mounted and offers the ready report', async () => {
    fetch.mockResolvedValueOnce({ data: { id: 'report_1', status: 'queued' } });
    fetch.mockResolvedValueOnce({ data: { status: 'rendering' } });
    fetch.mockResolvedValueOnce({ data: { status: 'ready' } });
    wrapper = await mountSuspended(DownloadButton, { props: { scanId: 'scan_1' } });
    await wrapper.find('button').trigger('click');
    await flushPromises();
    vi.advanceTimersByTime(2000);
    await flushPromises();
    vi.advanceTimersByTime(3000);
    await flushPromises();
    expect(wrapper.find('a[href="/api/v1/report/pdf/report_1/download"]').text()).toBe(
      'Download PDF',
    );
    vi.advanceTimersByTime(120_000);
    await flushPromises();
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
