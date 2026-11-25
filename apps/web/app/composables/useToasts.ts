import { ref, type Ref } from 'vue';

import type { Toast, ToastTone } from '~/types/toast';

const toasts: Ref<Toast[]> = ref([]);
let sequence = 0;
const AUTO_DISMISS_MS = 4000;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function useToasts() {
  function push(tone: ToastTone, title: string, message = ''): string {
    const id = `toast-${++sequence}`;
    toasts.value = [
      ...toasts.value,
      { id, tone, title, message, dismissAt: Date.now() + AUTO_DISMISS_MS },
    ];
    // Schedule auto-dismiss using setTimeout (works with fake timers in tests)
    const timer = setTimeout(() => {
      dismiss(id);
      timers.delete(id);
    }, AUTO_DISMISS_MS);
    timers.set(id, timer);
    return id;
  }

  function dismiss(id: string): void {
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
  }

  return { toasts, push, dismiss };
}
