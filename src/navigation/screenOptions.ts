import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';

import type { ThemeTokens } from '@/theme/tokens';

const STACK_ANIM_MS = 160;
const MODAL_ANIM_MS = 180;

export function stackScreenOptions(tokens: ThemeTokens): NativeStackNavigationOptions {
  return {
    headerShown: false,
    contentStyle: { backgroundColor: tokens.background },
    animation: 'fade',
    animationDuration: STACK_ANIM_MS,
  };
}

export function modalScreenOptions(
  tokens: ThemeTokens,
  title: string
): NativeStackNavigationOptions {
  return {
    presentation: 'modal',
    headerShown: true,
    title,
    headerStyle: { backgroundColor: tokens.background },
    headerTintColor: tokens.accent,
    headerShadowVisible: false,
    headerBackVisible: true,
    contentStyle: { backgroundColor: tokens.background },
    animation: 'fade_from_bottom',
    animationDuration: MODAL_ANIM_MS,
  };
}

export function fullScreenModalOptions(tokens: ThemeTokens): NativeStackNavigationOptions {
  return {
    presentation: 'fullScreenModal',
    headerShown: false,
    contentStyle: { backgroundColor: tokens.background },
    animation: 'fade',
    animationDuration: STACK_ANIM_MS,
  };
}
