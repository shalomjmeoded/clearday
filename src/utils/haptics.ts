import * as Haptics from 'expo-haptics';

import { useSettingsStore } from '@/store/settingsStore';

function isEnabled(): boolean {
  return useSettingsStore.getState().settings.hapticsEnabled;
}

export async function triggerLightHaptic(): Promise<void> {
  if (!isEnabled()) return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // ignore
  }
}

export async function triggerSuccessHaptic(): Promise<void> {
  if (!isEnabled()) return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // ignore
  }
}

export async function triggerMediumHaptic(): Promise<void> {
  if (!isEnabled()) return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {
    // ignore
  }
}

export async function triggerSelectionHaptic(): Promise<void> {
  if (!isEnabled()) return;
  try {
    await Haptics.selectionAsync();
  } catch {
    // ignore
  }
}

export async function triggerSoftHaptic(): Promise<void> {
  if (!isEnabled()) return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
  } catch {
    // ignore
  }
}
