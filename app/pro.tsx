import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MIN_TOUCH_TARGET } from '@/constants/layout';
import { PRO_PRIVACY_NOTE } from '@/constants/privacyCopy';
import { PRO_INCLUDED_FEATURES } from '@/features/pro/proFeatures';
import { subscriptionService } from '@/features/pro/subscriptionService';
import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useSettingsStore } from '@/store/settingsStore';
import { useTheme } from '@/theme/ThemeProvider';
import { triggerSelectionHaptic } from '@/utils/haptics';

const PLANS = [
  { id: 'monthly', label: 'Monthly', price: '$1.99', period: '/ month' },
  { id: 'yearly', label: 'Yearly', price: '$14.99', period: '/ year', featured: true },
  { id: 'lifetime', label: 'Lifetime', price: '$34.99', period: 'once' },
];

export default function ProScreen() {
  const { tokens } = useTheme();
  const isPro = useSettingsStore((s) => s.settings.isPro);
  const setSetting = useSettingsStore((s) => s.setSetting);

  const togglePro = async () => {
    await triggerSelectionHaptic();
    await setSetting('isPro', !isPro);
  };

  const handleRestore = async () => {
    await triggerSelectionHaptic();
    await subscriptionService.restorePurchases();
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: '',
          headerStyle: { backgroundColor: tokens.background },
          headerTintColor: tokens.accent,
          headerShadowVisible: false,
        }}
      />
      <SafeAreaView
        style={[styles.safe, { backgroundColor: tokens.background }]}
        edges={['bottom']}
      >
        <ScrollView
          style={[styles.scroll, { backgroundColor: tokens.background }]}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
          bounces
        >
          {isPro ? (
            <View style={[styles.badge, { backgroundColor: tokens.accentSoft }]}>
              <Text style={[typography.button, { color: tokens.accent, fontSize: 14 }]}>
                Pro active
              </Text>
            </View>
          ) : null}

          <Text style={[typography.heroTitle, styles.title, { color: tokens.text }]}>
            Make it yours.
          </Text>
          <Text style={[typography.body, styles.subtitle, { color: tokens.mutedText }]}>
            Unlock unlimited lists, recurring tasks, advanced reminders, widgets, premium
            themes, backup/export, sync, shared lists, voice capture, and insights.
          </Text>

          <View style={styles.plans}>
            {PLANS.map((plan) => (
              <View
                key={plan.id}
                style={[
                  styles.plan,
                  {
                    backgroundColor: tokens.card,
                    borderColor: plan.featured ? tokens.accent : tokens.border,
                    borderWidth: plan.featured ? 1.5 : StyleSheet.hairlineWidth,
                  },
                ]}
              >
                <Text style={[typography.body, { color: tokens.text, fontWeight: '600' }]}>
                  {plan.label}
                </Text>
                <Text style={[typography.meta, { color: tokens.mutedText, marginTop: 2 }]}>
                  {plan.price}
                  {plan.period}
                </Text>
              </View>
            ))}
          </View>

          {!isPro ? (
            <Pressable
              style={[
                styles.cta,
                { backgroundColor: tokens.accent, opacity: 0.45, minHeight: MIN_TOUCH_TARGET },
              ]}
              disabled
            >
              <Text style={[typography.button, { color: tokens.onAccent }]}>
                Coming soon
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={handleRestore}
            style={({ pressed }) => [
              styles.restoreBtn,
              { borderColor: tokens.border, minHeight: MIN_TOUCH_TARGET },
              pressed && { opacity: 0.75 },
            ]}
          >
            <Text style={[typography.button, { color: tokens.accent, fontSize: 15 }]}>
              Restore purchases
            </Text>
          </Pressable>

          <View style={[styles.featureList, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
            {PRO_INCLUDED_FEATURES.map((feature) => (
              <Text
                key={feature}
                style={[typography.body, styles.featureItem, { color: tokens.text }]}
              >
                · {feature}
              </Text>
            ))}
          </View>

          <Text style={[typography.meta, styles.privacyFooter, { color: tokens.mutedText }]}>
            {PRO_PRIVACY_NOTE}
          </Text>

          <View style={[styles.devBox, { borderColor: tokens.border }]}>
            <Text style={[typography.caption, { color: tokens.mutedText }]}>
              DEVELOPER
            </Text>
            <Pressable
              onPress={togglePro}
              style={({ pressed }) => [
                styles.devToggle,
                {
                  backgroundColor: tokens.sectionBg,
                  minHeight: MIN_TOUCH_TARGET,
                  borderColor: isPro ? tokens.accent : tokens.border,
                  borderWidth: isPro ? 1.5 : StyleSheet.hairlineWidth,
                },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={[typography.body, { color: tokens.text }]}>
                Mock Pro enabled: {isPro ? 'On' : 'Off'}
              </Text>
            </Pressable>
            <Text style={[typography.meta, styles.devHint, { color: tokens.mutedText }]}>
              Persists in local SQLite settings on this device.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl * 2,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  title: { marginBottom: spacing.md },
  subtitle: { marginBottom: spacing.xl, maxWidth: 340, lineHeight: 22 },
  plans: { gap: spacing.sm, marginBottom: spacing.lg },
  plan: {
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  cta: {
    justifyContent: 'center',
    borderRadius: radius.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  restoreBtn: {
    justifyContent: 'center',
    borderRadius: radius.md,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.xl,
  },
  featureList: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.xl,
  },
  featureItem: { lineHeight: 22 },
  privacyFooter: {
    lineHeight: 20,
    marginBottom: spacing.xl,
    textTransform: 'none',
    letterSpacing: 0,
    fontWeight: '400',
  },
  devBox: {
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  devToggle: {
    justifyContent: 'center',
    borderRadius: radius.md,
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  devHint: {
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: spacing.sm,
  },
});
