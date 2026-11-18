import { describe, expect, it } from 'vitest';

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
});
