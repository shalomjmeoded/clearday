import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { useSettingsStore } from '@/store/settingsStore';
import type { ThemeMode } from '@/types/settings';

import { resolveThemeTokens } from './resolveTheme';
import type { ThemeTokens } from './tokens';

interface ThemeContextValue {
  tokens: ThemeTokens;
  mode: ThemeMode;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const themeMode = useSettingsStore((s) => s.settings.theme);
  const systemScheme = useColorScheme();

  const value = useMemo<ThemeContextValue>(() => {
    const tokens = resolveThemeTokens(themeMode, systemScheme);
    const isDark =
      themeMode === 'dark' ||
      (themeMode === 'system' && systemScheme === 'dark');
    return {
      tokens,
      mode: themeMode,
      isDark,
    };
  }, [themeMode, systemScheme]);

  return (
    <ThemeContext.Provider value={value}>
      <StatusBar style={value.isDark ? 'light' : 'dark'} />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
