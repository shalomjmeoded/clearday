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
   * Groups toasts that describe the same ongoing thing (a growing delete
   * batch, repeated archives). A new toast with the current toast's key
   * replaces it in place; a different key waits its turn instead of cutting
   * the current toast's Undo window short.
   */
  key?: string;
  /**
   * Runs when the toast goes away without its action being taken: timeout,
   * tap-to-dismiss, or replacement by a newer same-key toast. Lets a caller
   * defer an irreversible step (like a permanent delete) until the Undo
   * window closes.
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
      key?: string;
      onExpire?: () => void | Promise<void>;
    }
  ) => void;
  /** `ranAction` marks a dismissal caused by the action button, so onExpire is skipped. */
  dismiss: (id?: number, options?: { ranAction?: boolean }) => void;
}

let nextToastId = 1;

/**
 * Toasts whose turn hasn't come. Kept outside the store: the <Toast />
 * component only ever renders the current one.
 */
let queue: Toast[] = [];
/** Dropping older waiters keeps a burst of actions from backing up forever. */
const MAX_QUEUED = 3;

function makeToast(
  message: string,
  options?: Parameters<ToastState['show']>[1]
): Toast {
  return {
    id: nextToastId++,
    message,
    action: options?.action,
    duration: options?.duration ?? 5000,
    key: options?.key,
    onExpire: options?.onExpire,
  };
}

/**
 * One transient message at a time, rendered by <Toast />. Messages shown
 * while another is up queue behind it (same-key messages replace in place),
 * so an "Archived" can no longer silently close a pending delete's Undo.
 */
export const useToastStore = create<ToastState>((set, get) => ({
  toast: null,
  show: (message, options) => {
    const next = makeToast(message, options);
    const current = get().toast;

    if (!current) {
      set({ toast: next });
      return;
    }

    if (current.key !== undefined && current.key === next.key) {
      // Same subject: the newer toast supersedes it on screen. Its expiry
      // still runs so a deferred cleanup is never lost; batch-style callers
      // (delete undo) void superseded expiries themselves.
      if (current.onExpire) void current.onExpire();
      set({ toast: next });
      return;
    }

    const sameKeyIndex =
      next.key === undefined
        ? -1
        : queue.findIndex((queued) => queued.key === next.key);
    if (sameKeyIndex >= 0) {
      const [replaced] = queue.splice(sameKeyIndex, 1, next);
      if (replaced.onExpire) void replaced.onExpire();
      return;
    }

    queue.push(next);
    while (queue.length > MAX_QUEUED) {
      const dropped = queue.shift()!;
      if (dropped.onExpire) void dropped.onExpire();
    }
  },
  dismiss: (id, options) => {
    const current = get().toast;
    if (!current) return;
    if (id !== undefined && current.id !== id) return;
    set({ toast: queue.shift() ?? null });
    if (!options?.ranAction && current.onExpire) void current.onExpire();
  },
}));

/** Test hook: clears any queued toasts between cases. */
export function __resetToastQueue(): void {
  queue = [];
}
