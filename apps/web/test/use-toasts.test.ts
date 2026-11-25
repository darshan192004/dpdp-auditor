import { describe, expect, it, vi } from 'vitest';

import { useToasts } from '../app/composables/useToasts';

describe('useToasts', () => {
  it('pushes and dismisses a toast', () => {
    const { toasts, push, dismiss } = useToasts();
    const before = toasts.value.length;
    const id = push('success', 'Scan started', 'Queued for scanning.');

    expect(toasts.value.at(-1)).toMatchObject({
      id,
      tone: 'success',
      title: 'Scan started',
      message: 'Queued for scanning.',
    });

    dismiss(id);
    expect(toasts.value).toHaveLength(before);
  });

  it('auto-dismisses toasts after 4 seconds', () => {
    vi.useFakeTimers();
    const { toasts, push } = useToasts();
    const _id = push('info', 'Auto-dismiss test');

    expect(toasts.value).toHaveLength(1);

    // Advance timers by 4 seconds
    vi.advanceTimersByTime(4000);

    // Trigger watchEffect to run cleanup
    toasts.value = [...toasts.value];

    expect(toasts.value).toHaveLength(0);
    vi.useRealTimers();
  });

  it('includes dismissAt timestamp on pushed toasts', () => {
    const { toasts, push } = useToasts();
    const before = Date.now();
    const id = push('error', 'Has timestamp');

    const toast = toasts.value.find((t) => t.id === id);
    expect(toast).toBeDefined();
    expect(toast?.dismissAt).toBeDefined();
    expect(toast!.dismissAt).toBeGreaterThanOrEqual(before + 4000 - 10); // allow small delta
  });
});
