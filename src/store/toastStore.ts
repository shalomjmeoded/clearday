import { create } from 'zustand';

export interface ToastAction {
  label: string;
  onPress: () => void | Promise<void>;
}

export interface Toast {
  id: number;
  message: string;
  action?: ToastAction;
  /** Auto-dismiss delay in ms. */
  duration: number;
}

interface ToastState {
  toast: Toast | null;
  show: (message: string, options?: { action?: ToastAction; duration?: number }) => void;
  dismiss: (id?: number) => void;
}

let nextToastId = 1;

/** Single transient message, replaced by the next one. Rendered by <Toast />. */
export const useToastStore = create<ToastState>((set, get) => ({
  toast: null,
  show: (message, options) => {
    set({
      toast: {
        id: nextToastId++,
        message,
        action: options?.action,
        duration: options?.duration ?? 5000,
      },
    });
  },
  dismiss: (id) => {
    const current = get().toast;
    if (!current) return;
    if (id !== undefined && current.id !== id) return;
    set({ toast: null });
  },
}));
