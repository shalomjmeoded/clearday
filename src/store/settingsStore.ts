import { create } from 'zustand';

import type { AppSettings } from '@/types/settings';
import { DEFAULT_SETTINGS } from '@/types/settings';

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  hydrate: () => Promise<void>;
  setSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  hydrate: async () => {
    const { loadSettings } = await import('@/features/settings/settingsRepository');
    const settings = await loadSettings();
    set({ settings, loaded: true });
  },
  setSetting: async (key, value) => {
    const { updateSetting } = await import('@/features/settings/settingsRepository');
    const settings = await updateSetting(key, value);
    set({ settings });
  },
}));
