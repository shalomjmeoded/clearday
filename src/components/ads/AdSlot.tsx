import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useKeyboardState } from 'react-native-keyboard-controller';

import { getAdForPlacement, shouldShowAds } from '@/features/ads/adService';
import type { AdPlacement } from '@/features/ads/types';
import { spacing } from '@/theme/spacing';
import { useSettingsStore } from '@/store/settingsStore';

import { NativeAdCard } from './NativeAdCard';

/** Reserved height so the list does not jump when the ad fades in. */
const AD_SLOT_MIN_HEIGHT = 88;

interface Props {
  placement: AdPlacement;
  /** Hide while keyboard is open (Today add bar). */
  hideWhenKeyboardOpen?: boolean;
  /** Parent scroll already applies horizontal padding. */
  inset?: boolean;
}

export function AdSlot({
  placement,
  hideWhenKeyboardOpen = false,
  inset = true,
}: Props) {
  const isPro = useSettingsStore((s) => s.settings.isPro);
  const keyboardVisible = useKeyboardState((s) => s.isVisible);

  if (!shouldShowAds(isPro)) return null;
  if (hideWhenKeyboardOpen && keyboardVisible) return null;

  const ad = getAdForPlacement(placement);

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={[styles.wrap, inset && styles.inset, { minHeight: AD_SLOT_MIN_HEIGHT }]}
    >
      <NativeAdCard ad={ad} onPress={() => router.push('/pro')} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    justifyContent: 'center',
  },
  inset: {
    paddingHorizontal: spacing.lg,
  },
});
