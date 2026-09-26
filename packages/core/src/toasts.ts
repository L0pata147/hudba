import { createStore } from 'zustand/vanilla';

export type ToastTone = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  action?: { label: string; run: () => void };
  /** ms; 0 = sticky */
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  push(t: Omit<Toast, 'id' | 'duration'> & { duration?: number }): number;
  dismiss(id: number): void;
}

let nextId = 1;

export const toastStore = createStore<ToastState>()((set) => ({
  toasts: [],
  push(t) {
    const id = nextId++;
    const toast: Toast = { duration: t.tone === 'error' ? 6000 : 3500, ...t, id };
    // Collapse identical messages so a flapping connection does not spam.
    set((s) => ({ toasts: [...s.toasts.filter((x) => x.message !== t.message), toast].slice(-4) }));
    return id;
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

export const toast = {
  info: (message: string, action?: Toast['action']) => toastStore.getState().push({ tone: 'info', message, action }),
  success: (message: string, action?: Toast['action']) => toastStore.getState().push({ tone: 'success', message, action }),
  error: (message: string, action?: Toast['action']) => toastStore.getState().push({ tone: 'error', message, action }),
};
