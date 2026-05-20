import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MockAd } from '@/features/ads/types';
import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';

interface Props {
  ad: MockAd;
  onPress?: () => void;
}

export function NativeAdCard({ ad, onPress }: Props) {
  const { tokens } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: tokens.card,
          borderColor: tokens.border,
        },
        pressed && onPress && { opacity: 0.92 },
      ]}
      disabled={!onPress}
    >
      <Text style={[typography.caption, styles.sponsor, { color: tokens.mutedText }]}>
        {ad.sponsor}
      </Text>
      <Text style={[typography.body, styles.title, { color: tokens.text }]}>
        {ad.title}
      </Text>
      <Text style={[typography.meta, { color: tokens.mutedText }]}>{ad.body}</Text>
      {onPress ? (
        <View style={styles.ctaRow}>
          <Text style={[typography.button, { color: tokens.accent, fontSize: 14 }]}>
            {ad.cta}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.xs,
  },
  sponsor: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 10,
  },
  title: { fontWeight: '600', marginTop: spacing.xs },
  ctaRow: { marginTop: spacing.sm },
});
