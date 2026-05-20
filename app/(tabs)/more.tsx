import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScrollScreen } from '@/components/layout/ScrollScreen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { MIN_TOUCH_TARGET } from '@/constants/layout';
import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useSettingsStore } from '@/store/settingsStore';
import { useTheme } from '@/theme/ThemeProvider';
import { triggerSelectionHaptic } from '@/utils/haptics';

function LinkRow({
  label,
  subtitle,
  onPress,
  last,
}: {
  label: string;
  subtitle?: string;
  onPress: () => void;
  last?: boolean;
}) {
  const { tokens } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.link,
        !last && {
          borderBottomColor: tokens.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={styles.linkInner}>
        <Text style={[typography.body, { color: tokens.text }]}>{label}</Text>
        {subtitle ? (
          <Text style={[typography.meta, styles.subtitle, { color: tokens.mutedText }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function MoreScreen() {
  const { tokens } = useTheme();
  const isPro = useSettingsStore((s) => s.settings.isPro);

  const open = async (path: '/settings' | '/pro') => {
    await triggerSelectionHaptic();
    router.push(path);
  };

  return (
    <ScrollScreen
      header={<ScreenHeader title="More" />}
      contentContainerStyle={styles.scroll}
    >
      <View
        style={[
          styles.menu,
          { backgroundColor: tokens.card, borderColor: tokens.border },
        ]}
      >
        <LinkRow label="Settings" onPress={() => open('/settings')} />
        <LinkRow
          label="ClearDay Pro"
          subtitle={isPro ? 'Pro active' : 'Make it yours.'}
          onPress={() => open('/pro')}
          last
        />
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingTop: spacing.md,
    gap: spacing.lg,
  },
  menu: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  link: {
    minHeight: MIN_TOUCH_TARGET + 12,
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  linkInner: { gap: spacing.xs },
  subtitle: { marginTop: 2 },
});
