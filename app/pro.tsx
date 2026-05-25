import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MIN_TOUCH_TARGET } from '@/constants/layout';
import { PRO_PRIVACY_NOTE } from '@/constants/privacyCopy';
import { presentCustomerCenter } from '@/features/pro/paywallService';
import {
  PRODUCT_IDS,
  getPlanLabel,
  getPlanPeriod,
} from '@/features/pro/products';
import { PRO_INCLUDED_FEATURES } from '@/features/pro/proFeatures';
import { useProStore } from '@/store/proStore';
import { radius, spacing } from '@/theme/spacing';
import { useTheme } from '@/theme/ThemeProvider';
import { typography } from '@/theme/typography';
import { triggerSelectionHaptic } from '@/utils/haptics';

const FALLBACK_PLANS = [
  {
    id: PRODUCT_IDS.monthly,
    label: 'Monthly',
    price: 'Unavailable',
    period: '/ month',
  },
  {
    id: PRODUCT_IDS.yearly,
    label: 'Yearly',
    price: 'Unavailable',
    period: '/ year',
    featured: true,
  },
] as const;

export default function ProScreen() {
  const { tokens } = useTheme();
  const isPro = useProStore((s) => s.isPro);
  const loading = useProStore((s) => s.loading);
  const purchasing = useProStore((s) => s.purchasing);
  const offerings = useProStore((s) => s.offerings);
  const error = useProStore((s) => s.error);
  const mockProEnabled = useProStore((s) => s.mockProEnabled);
  const loadOfferings = useProStore((s) => s.loadOfferings);
  const purchase = useProStore((s) => s.purchase);
  const restorePurchases = useProStore((s) => s.restorePurchases);
  const setMockProForDevOnly = useProStore((s) => s.setMockProForDevOnly);

  const [selectedProductId, setSelectedProductId] = useState<string>(
    PRODUCT_IDS.yearly
  );

  useEffect(() => {
    void loadOfferings();
  }, [loadOfferings]);

  const plans =
    offerings.length > 0
      ? offerings
        .map((pkg) => ({
          id: pkg.productId,
          label: getPlanLabel(pkg.productId),
          price: pkg.priceString,
          period: getPlanPeriod(pkg.productId),
          featured: pkg.productId === PRODUCT_IDS.yearly,
        }))
      : FALLBACK_PLANS.map((plan) => ({
          id: plan.id,
          label: plan.label,
          price: plan.price,
          period: plan.period,
          featured: 'featured' in plan ? plan.featured : false,
        }));

  const handlePurchase = useCallback(async () => {
    await triggerSelectionHaptic();
    await purchase(selectedProductId);
  }, [purchase, selectedProductId]);

  const handleRestore = useCallback(async () => {
    await triggerSelectionHaptic();
    const result = await restorePurchases();
    Alert.alert('Restore Purchases', result.message);
  }, [restorePurchases]);

  const handleCustomerCenter = useCallback(async () => {
    await triggerSelectionHaptic();
    await presentCustomerCenter();
  }, []);

  const toggleMockPro = useCallback(async () => {
    await triggerSelectionHaptic();
    setMockProForDevOnly(!mockProEnabled);
  }, [mockProEnabled, setMockProForDevOnly]);

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
            Make Do! yours.
          </Text>
          <Text style={[typography.body, styles.subtitle, { color: tokens.mutedText }]}>
            Unlock premium features and keep the app private, simple, and focused.
          </Text>

          {loading && offerings.length === 0 ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={tokens.accent} />
              <Text style={[typography.meta, { color: tokens.mutedText }]}>
                Loading plans…
              </Text>
            </View>
          ) : null}

          <View style={styles.plans}>
            {plans.map((plan) => {
              const selected = selectedProductId === plan.id;

              return (
                <Pressable
                  key={plan.id}
                  onPress={() => {
                    void triggerSelectionHaptic();
                    setSelectedProductId(plan.id);
                  }}
                  disabled={isPro}
                  style={[
                    styles.plan,
                    {
                      backgroundColor: tokens.card,
                      borderColor: selected ? tokens.accent : tokens.border,
                      borderWidth: selected ? 1.5 : StyleSheet.hairlineWidth,
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
                </Pressable>
              );
            })}
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={[typography.meta, { color: tokens.mutedText, lineHeight: 20 }]}>
                {error}
              </Text>
              <Pressable
                onPress={() => void loadOfferings()}
                style={({ pressed }) => [
                  styles.retryBtn,
                  { borderColor: tokens.border, minHeight: MIN_TOUCH_TARGET },
                  pressed && { opacity: 0.75 },
                ]}
              >
                <Text style={[typography.button, { color: tokens.accent, fontSize: 15 }]}>
                  Retry
                </Text>
              </Pressable>
            </View>
          ) : null}

          {!isPro ? (
            <>
              <Pressable
                onPress={() => void handlePurchase()}
                disabled={purchasing || offerings.length === 0}
                style={({ pressed }) => [
                  styles.cta,
                  {
                    backgroundColor: tokens.accent,
                    opacity: purchasing || offerings.length === 0 ? 0.45 : pressed ? 0.85 : 1,
                    minHeight: MIN_TOUCH_TARGET,
                  },
                ]}
              >
                <Text style={[typography.button, { color: tokens.onAccent }]}>
                  {purchasing ? 'Processing…' : 'Continue with selected plan'}
                </Text>
              </Pressable>

            </>
          ) : (
            <Pressable
              onPress={() => void handleCustomerCenter()}
              style={({ pressed }) => [
                styles.secondaryBtn,
                { borderColor: tokens.border, minHeight: MIN_TOUCH_TARGET },
                pressed && { opacity: 0.75 },
              ]}
            >
              <Text style={[typography.button, { color: tokens.accent, fontSize: 15 }]}>
                Manage subscription
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => void handleRestore()}
            style={({ pressed }) => [
              styles.restoreBtn,
              { borderColor: tokens.border, minHeight: MIN_TOUCH_TARGET },
              pressed && { opacity: 0.75 },
            ]}
          >
            <Text style={[typography.button, { color: tokens.accent, fontSize: 15 }]}>
              Restore Purchases
            </Text>
          </Pressable>

          <View
            style={[
              styles.featureList,
              { backgroundColor: tokens.card, borderColor: tokens.border },
            ]}
          >
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

          {__DEV__ ? (
            <View style={[styles.devBox, { borderColor: tokens.border }]}>
              <Text style={[typography.caption, { color: tokens.mutedText }]}>
                DEVELOPER
              </Text>
              <Pressable
                onPress={() => void toggleMockPro()}
                style={({ pressed }) => [
                  styles.devToggle,
                  {
                    backgroundColor: tokens.sectionBg,
                    minHeight: MIN_TOUCH_TARGET,
                    borderColor: mockProEnabled ? tokens.accent : tokens.border,
                    borderWidth: mockProEnabled ? 1.5 : StyleSheet.hairlineWidth,
                  },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text style={[typography.body, { color: tokens.text }]}>
                  Mock Pro enabled: {mockProEnabled ? 'On' : 'Off'}
                </Text>
              </Pressable>
              <Text style={[typography.meta, styles.devHint, { color: tokens.mutedText }]}>
                Dev-only override when RevenueCat keys or store products are not ready.
              </Text>
            </View>
          ) : null}
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
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  plans: { gap: spacing.sm, marginBottom: spacing.lg },
  plan: {
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  errorBox: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  retryBtn: {
    justifyContent: 'center',
    borderRadius: radius.md,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  cta: {
    justifyContent: 'center',
    borderRadius: radius.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  secondaryBtn: {
    justifyContent: 'center',
    borderRadius: radius.md,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
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
