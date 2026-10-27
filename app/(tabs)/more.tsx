import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScrollScreen } from '@/components/layout/ScrollScreen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { MIN_TOUCH_TARGET } from '@/constants/layout';
import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useProStore } from '@/store/proStore';
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
      accessibilityRole="button"
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
  const isPro = useProStore((s) => s.isPro);

  const open = async (path: '/settings' | '/pro' | '/finished' | '/help') => {
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
        <LinkRow
          label="Finished Tasks"
          subtitle="History of completed tasks"
          onPress={() => open('/finished')}
        />
        <LinkRow label="Help" onPress={() => open('/help')} />
        <LinkRow label="Settings" onPress={() => open('/settings')} />
        <LinkRow
          label="Do! Pro"
          subtitle={isPro ? 'Pro active' : 'Make Do! yours.'}
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
