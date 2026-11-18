import { ref, type Ref } from 'vue';

import type { Toast, ToastTone } from '~/types/toast';

const toasts: Ref<Toast[]> = ref([]);
let sequence = 0;

export function useToasts() {
  function push(tone: ToastTone, title: string, message = ''): string {
    const id = `toast-${++sequence}`;
    toasts.value = [...toasts.value, { id, tone, title, message }];
    return id;
  }

  function dismiss(id: string): void {
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
  }

  return { toasts, push, dismiss };
}
