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
  /**
   * Runs when the toast goes away without its action being taken: timeout,
   * tap-to-dismiss, or replacement by a newer toast. Lets a caller defer an
   * irreversible step (like a permanent delete) until the Undo window closes.
   */
  onExpire?: () => void | Promise<void>;
}

interface ToastState {
  toast: Toast | null;
  show: (
    message: string,
    options?: {
      action?: ToastAction;
      duration?: number;
      onExpire?: () => void | Promise<void>;
    }
  ) => void;
  /** `ranAction` marks a dismissal caused by the action button, so onExpire is skipped. */
  dismiss: (id?: number, options?: { ranAction?: boolean }) => void;
}

let nextToastId = 1;

/** Single transient message, replaced by the next one. Rendered by <Toast />. */
export const useToastStore = create<ToastState>((set, get) => ({
  toast: null,
  show: (message, options) => {
    const previous = get().toast;
    // A newer toast closes the Undo window of the one it replaces.
    if (previous?.onExpire) void previous.onExpire();
    set({
      toast: {
        id: nextToastId++,
        message,
        action: options?.action,
        duration: options?.duration ?? 5000,
        onExpire: options?.onExpire,
      },
    });
  },
  dismiss: (id, options) => {
    const current = get().toast;
    if (!current) return;
    if (id !== undefined && current.id !== id) return;
    set({ toast: null });
    if (!options?.ranAction && current.onExpire) void current.onExpire();
  },
}));
