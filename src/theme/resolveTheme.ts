import type { ColorSchemeName } from 'react-native';

import type { ThemeMode } from '@/types/settings';

import { darkTheme, lightTheme, type ThemeTokens } from './tokens';

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
  systemScheme: ColorSchemeName | null | undefined
): ThemeTokens {
  return resolveIsDark(themeMode, systemScheme) ? darkTheme : lightTheme;
}
