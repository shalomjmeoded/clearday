import React, { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';

import { getTabBarHeight, MIN_TOUCH_TARGET } from '@/constants/layout';
import { useToastStore } from '@/store/toastStore';
import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';
import { triggerLightHaptic } from '@/utils/haptics';

/**
 * On iOS a native modal screen is presented above the whole React root, so a
 * plain absolutely-positioned view would be hidden whenever the user acts
 * from the task detail sheet. FullWindowOverlay renders above those too.
 * Android stacks screens in one window, so an ordinary view suffices.
 */
function OverlayHost({ children }: { children: React.ReactNode }) {
  if (Platform.OS === 'ios') {
    return <FullWindowOverlay>{children}</FullWindowOverlay>;
  }
  return <>{children}</>;
}

/**
 * One-line transient message with an optional action. Sits just above the
 * tab bar, left-aligned so it leaves the add button clear, and never covers
 * a screen title.
 */
export function Toast() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToastStore((s) => s.toast);
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => dismiss(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  if (!toast) return null;

  const runAction = async () => {
    await triggerLightHaptic();
    dismiss(toast.id);
    await toast.action?.onPress();
  };

  return (
    <OverlayHost>
      <View
        pointerEvents="box-none"
        style={[
          styles.host,
          { bottom: getTabBarHeight(insets.bottom) + spacing.sm },
        ]}
      >
        <Animated.View
          key={toast.id}
          entering={FadeInDown.duration(180)}
          exiting={FadeOutDown.duration(140)}
          style={[
            styles.card,
            { backgroundColor: tokens.card, borderColor: tokens.border },
          ]}
        >
          <Pressable
            onPress={() => dismiss(toast.id)}
            style={styles.message}
            accessibilityRole="text"
          >
            <Text
              style={[typography.body, { color: tokens.text }]}
              numberOfLines={1}
            >
              {toast.message}
            </Text>
          </Pressable>
          {toast.action ? (
            <Pressable
              onPress={runAction}
              style={styles.action}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={toast.action.label}
            >
              <Text style={[typography.button, { color: tokens.accent }]}>
                {toast.action.label}
              </Text>
            </Pressable>
          ) : null}
        </Animated.View>
      </View>
    </OverlayHost>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    zIndex: 100,
    elevation: 100,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
    // Leaves the right-hand add button uncovered on list screens.
    maxWidth: '78%',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  message: { flexShrink: 1, paddingVertical: spacing.sm },
  action: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
});
