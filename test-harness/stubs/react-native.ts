/** Minimal react-native stub: records alerts and lets tests choose which button to press. */
type AlertButton = {
  text?: string;
  style?: string;
  onPress?: () => void;
};

export const alertLog: { title: string; message?: string }[] = [];

let buttonPicker: (buttons: AlertButton[]) => AlertButton | undefined = () =>
  undefined;

export function __setAlertButtonPicker(
  picker: (buttons: AlertButton[]) => AlertButton | undefined
): void {
  buttonPicker = picker;
}

export function __clearAlerts(): void {
  alertLog.length = 0;
}

export const Alert = {
  alert(
    title: string,
    message?: string,
    buttons?: AlertButton[],
    options?: { cancelable?: boolean; onDismiss?: () => void }
  ): void {
    alertLog.push({ title, message });
    if (buttons) {
      const chosen = buttonPicker(buttons);
      if (chosen) chosen.onPress?.();
      // No button picked models the user dismissing the dialog.
      else options?.onDismiss?.();
    }
  },
};

export const Platform = { OS: 'ios' as const };

export const announcementLog: { message: string; queued: boolean }[] = [];

export function __clearAnnouncements(): void {
  announcementLog.length = 0;
}

export const AccessibilityInfo = {
  announceForAccessibility(message: string): void {
    announcementLog.push({ message, queued: false });
  },
  announceForAccessibilityWithOptions(
    message: string,
    options?: { queue?: boolean }
  ): void {
    announcementLog.push({ message, queued: Boolean(options?.queue) });
  },
  isScreenReaderEnabled: async (): Promise<boolean> => false,
  addEventListener: (): { remove: () => void } => ({ remove: () => {} }),
  getRecommendedTimeoutMillis: async (original: number): Promise<number> =>
    original,
};

/** react-native-purchases probes these at import time. */
export const NativeModules: Record<string, unknown> = {};

export class NativeEventEmitter {
  addListener(): { remove: () => void } {
    return { remove: () => {} };
  }
  removeAllListeners(): void {}
}
