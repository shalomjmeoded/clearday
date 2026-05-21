import type { ColorSchemeName } from 'react-native';

import type { ColorTheme, ThemeMode } from '@/types/settings';

import { darkPalettes, lightPalettes, type ThemeTokens } from './tokens';

export function resolveIsDark(
  themeMode: ThemeMode,
  systemScheme: ColorSchemeName | null | undefined
): boolean {
  if (themeMode === 'dark') return true;
  if (themeMode === 'light') return false;
  return systemScheme === 'dark';
}

export function resolveThemeTokens(
  themeMode: ThemeMode,
  systemScheme: ColorSchemeName | null | undefined,
  colorTheme: ColorTheme = 'classic'
): ThemeTokens {
  const palettes = resolveIsDark(themeMode, systemScheme) ? darkPalettes : lightPalettes;
  return palettes[colorTheme] ?? palettes.classic;
}
