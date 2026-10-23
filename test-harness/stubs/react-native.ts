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
  alert(title: string, message?: string, buttons?: AlertButton[]): void {
    alertLog.push({ title, message });
    if (buttons) {
      const chosen = buttonPicker(buttons);
      chosen?.onPress?.();
    }
  },
};

export const Platform = { OS: 'ios' as const };

/** react-native-purchases probes these at import time. */
export const NativeModules: Record<string, unknown> = {};

export class NativeEventEmitter {
  addListener(): { remove: () => void } {
    return { remove: () => {} };
  }
  removeAllListeners(): void {}
}
