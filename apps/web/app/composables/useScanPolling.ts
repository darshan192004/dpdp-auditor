import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';

import { isTerminalStatus, nextPollDelayMs, type ScanDetail } from '~~/shared/scan';

/**
 * Poll a scan while it is active (docs/design.md §7.3).
 *
 * The first response is server-rendered by `useFetch`; polling only starts on
 * the client. A successful refresh keeps the 2 s cadence, consecutive failures
 * back off to 8 s and then hold at 10 s, and a hidden tab schedules nothing.
 * The loop stops for good on a terminal status.
 *
 * `onTick` runs after every successful refresh so sibling data (the event
 * timeline) can refresh on the same cadence without a second polling loop.
 */
export function useScanPolling(
  scanId: Ref<string>,
  options: { onTick?: () => void | Promise<void> } = {},
) {
  const failures = ref(0);
  const visible = ref(true);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const { data, status, error, refresh } = useFetch<{ data: ScanDetail }>(
    () => `/api/v1/scan/${scanId.value}`,
    {
      key: `scan-poll:${scanId.value}`,
      headers: useRequestHeaders(['cookie']),
    },
  );

  const scan = computed<ScanDetail | null>(() => data.value?.data ?? null);
  const isTerminal = computed(() => scan.value !== null && isTerminalStatus(scan.value.status));
  const isPaused = computed(() => !visible.value);
  const pollError = computed(() =>
    failures.value >= 3 ? 'Live updates paused after repeated failures.' : null,
  );

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function schedule(): void {
    clearTimer();
    if (!import.meta.client) return;
    const delay = nextPollDelayMs({
      failures: failures.value,
      visible: visible.value,
      terminal: isTerminal.value,
    });
    if (delay !== null) timer = setTimeout(() => void tick(), delay);
  }

  async function tick(): Promise<void> {
    timer = null;
    if (isTerminal.value || !visible.value) return;

    try {
      await refresh();
      failures.value = 0;
      if (options.onTick !== undefined) {
        await options.onTick();
      }
    } catch {
      failures.value += 1;
    }
    schedule();
  }

  async function retry(): Promise<void> {
    failures.value = 0;
    await tick();
  }

  function readVisibility(): boolean {
    return typeof document === 'undefined' ? true : document.visibilityState !== 'hidden';
  }

  function onVisibilityChange(): void {
    visible.value = readVisibility();
    if (visible.value) schedule();
    else clearTimer();
  }

  onMounted(() => {
    visible.value = readVisibility();
    document.addEventListener('visibilitychange', onVisibilityChange);
    schedule();
  });

  onBeforeUnmount(() => {
    clearTimer();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  });

  watch(scanId, () => {
    failures.value = 0;
    schedule();
  });

  return {
    data,
    scan,
    status,
    error,
    refresh,
    isTerminal,
    isPaused,
    failures,
    pollError,
    retry,
  };
}
