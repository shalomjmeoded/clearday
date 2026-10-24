import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MIN_TOUCH_TARGET } from '@/constants/layout';
import { PRO_PRIVACY_NOTE } from '@/constants/privacyCopy';
import { presentCustomerCenter } from '@/features/pro/paywallService';
import {
  FALLBACK_PRICE_STRINGS,
  PRODUCT_IDS,
  getPlanBillingPeriod,
  getPlanLabel,
  getPlanPeriod,
} from '@/features/pro/products';
import { PRO_INCLUDED_FEATURES } from '@/features/pro/proFeatures';
import { useProStore } from '@/store/proStore';
import { radius, spacing } from '@/theme/spacing';
import { useTheme } from '@/theme/ThemeProvider';
import { typography } from '@/theme/typography';
import { triggerSelectionHaptic } from '@/utils/haptics';

const STANDARD_APPLE_EULA_URL =
  'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
const APPLE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';

const PRIVACY_POLICY_URL = 'https://clearday-seven.vercel.app/privacy';

export default function ProScreen() {
  const { tokens } = useTheme();
  const isPro = useProStore((s) => s.isPro);
  const notice = useProStore((s) => s.notice);
  const loading = useProStore((s) => s.loading);
  const restoring = useProStore((s) => s.restoring);
  const purchasing = useProStore((s) => s.purchasing);
  const offerings = useProStore((s) => s.offerings);
  const error = useProStore((s) => s.error);
  const activeProductId = useProStore((s) => s.activeProductId);
  const loadOfferings = useProStore((s) => s.loadOfferings);
  const purchase = useProStore((s) => s.purchase);
  const restorePurchases = useProStore((s) => s.restorePurchases);

  const [selectedProductId, setSelectedProductId] = useState<string>(
    PRODUCT_IDS.yearly
  );

  useEffect(() => {
    void loadOfferings();
  }, [loadOfferings]);

  useEffect(() => {
    if (activeProductId) {
      setSelectedProductId(activeProductId);
    }
  }, [activeProductId]);

  // Keep the selection purchasable: if the loaded offerings don't include the
  // selected product (e.g. one plan missing in the store), fall back to the
  // yearly plan when present, otherwise the first available package.
  useEffect(() => {
    if (offerings.length === 0) return;
    if (offerings.some((pkg) => pkg.productId === selectedProductId)) return;

    const preferred =
      offerings.find((pkg) => pkg.productId === PRODUCT_IDS.yearly) ?? offerings[0];
    setSelectedProductId(preferred.productId);
  }, [offerings, selectedProductId]);

  const plans = offerings.map((pkg) => ({
    id: pkg.productId,
    label: getPlanLabel(pkg.productId),
    price: pkg.priceString,
    period: getPlanPeriod(pkg.productId),
    featured: pkg.productId === PRODUCT_IDS.yearly,
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

  // The recovery button under an error must match what actually failed:
  // reloading plans does not help a declined purchase, and an
  // already-owned subscription needs Restore rather than Retry.
  const errorAction = useMemo(() => {
    switch (error?.action) {
      case 'retry-plans':
        return { label: 'Retry', run: loadOfferings };
      case 'retry-purchase':
        return { label: 'Try again', run: handlePurchase };
      case 'restore':
        return { label: 'Restore Purchases', run: handleRestore };
      default:
        return null;
    }
  }, [error?.action, loadOfferings, handlePurchase, handleRestore]);

  // Legal disclosure prices: prefer the live, localized store price and fall
  // back to the static strings only when offerings are unavailable, since the
  // disclosure has to render either way.
  const disclosureLines = useMemo(
    () =>
      ([PRODUCT_IDS.monthly, PRODUCT_IDS.yearly] as const).map((productId) => {
        const livePrice = offerings.find(
          (pkg) => pkg.productId === productId
        )?.priceString;

        return `${getPlanLabel(productId)} Pro: ${
          livePrice ?? FALLBACK_PRICE_STRINGS[productId]
        }${getPlanBillingPeriod(productId)}`;
      }),
    [offerings]
  );

  const errorActionBusy =
    (error?.action === 'retry-plans' && loading) ||
    (error?.action === 'retry-purchase' && purchasing) ||
    (error?.action === 'restore' && restoring);

  const handleCustomerCenter = useCallback(async () => {
    await triggerSelectionHaptic();
    console.info('[Subscriptions] Manage subscription pressed.');

    // presentCustomerCenter resolves after the sheet is dismissed (or returns
    // false if presenting failed), so only fall back when it reports failure.
    const openedCustomerCenter = await presentCustomerCenter();
    if (openedCustomerCenter) return;

    try {
      console.info('[Subscriptions] Opening Apple subscription management.');
      await Linking.openURL(APPLE_SUBSCRIPTIONS_URL);
    } catch (error) {
      console.warn('[Subscriptions] Failed to open Apple subscription management:', error);
      Alert.alert(
        'Manage Subscription',
        'Could not open subscription management. You can manage subscriptions from the App Store account settings.'
      );
    }
  }, []);

  const openTerms = useCallback(async () => {
    await triggerSelectionHaptic();
    await Linking.openURL(STANDARD_APPLE_EULA_URL);
  }, []);

  const openPrivacyPolicy = useCallback(async () => {
    await triggerSelectionHaptic();

    try {
      await Linking.openURL(PRIVACY_POLICY_URL);
    } catch (error) {
      console.warn('[Privacy] Failed to open privacy policy:', error);
      Alert.alert(
        'Privacy Policy',
        'Could not open the privacy policy. Please try again later.'
      );
    }
  }, []);

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

          {notice ? (
            <View
              style={[
                styles.notice,
                {
                  backgroundColor: tokens.card,
                  borderColor: notice.tone === 'warning' ? tokens.accent : tokens.border,
                },
              ]}
              accessibilityLiveRegion="polite"
            >
              <Text style={[typography.meta, styles.noticeText, { color: tokens.text }]}>
                {notice.message}
              </Text>
              {/* Only the urgent case gets its own button: a cancelled-but-active
                  subscription is served by the "Manage subscription" button below,
                  and two identical buttons on one screen reads as a bug. */}
              {notice.tone === 'warning' ? (
                <Pressable
                  onPress={() => void handleCustomerCenter()}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.retryBtn,
                    { borderColor: tokens.border, minHeight: MIN_TOUCH_TARGET },
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <Text style={[typography.button, { color: tokens.accent, fontSize: 15 }]}>
                    Update payment method
                  </Text>
                </Pressable>
              ) : null}
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

          <View style={styles.plans} accessibilityRole="radiogroup">
            {plans.map((plan) => {
              const selected = (activeProductId ?? selectedProductId) === plan.id;

              return (
                <Pressable
                  key={plan.id}
                  onPress={() => {
                    void triggerSelectionHaptic();
                    setSelectedProductId(plan.id);
                  }}
                  disabled={isPro}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, disabled: isPro }}
                  accessibilityLabel={`${plan.label}, ${plan.price}${plan.period}`}
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
                  <Text
                    style={[
                      typography.body,
                      { color: tokens.text, fontWeight: '600', marginTop: 2 },
                    ]}
                  >
                    {plan.price}
                    {plan.period}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {error ? (
            <View style={styles.errorBox} accessibilityLiveRegion="polite">
              <Text style={[typography.meta, { color: tokens.mutedText, lineHeight: 20 }]}>
                {error.message}
              </Text>
              {errorAction ? (
                <Pressable
                  onPress={() => void errorAction.run()}
                  disabled={errorActionBusy}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: errorActionBusy, busy: errorActionBusy }}
                  style={({ pressed }) => [
                    styles.retryBtn,
                    { borderColor: tokens.border, minHeight: MIN_TOUCH_TARGET },
                    (pressed || errorActionBusy) && { opacity: 0.6 },
                  ]}
                >
                  <Text style={[typography.button, { color: tokens.accent, fontSize: 15 }]}>
                    {errorAction.label}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {!isPro ? (
            offerings.length > 0 ? (
              <Pressable
                onPress={() => void handlePurchase()}
                disabled={purchasing}
                accessibilityRole="button"
                accessibilityState={{ disabled: purchasing, busy: purchasing }}
                style={({ pressed }) => [
                  styles.cta,
                  {
                    backgroundColor: tokens.accent,
                    opacity: purchasing ? 0.45 : pressed ? 0.85 : 1,
                    minHeight: MIN_TOUCH_TARGET,
                  },
                ]}
              >
                <Text style={[typography.button, { color: tokens.onAccent }]}>
                  {purchasing ? 'Processing…' : 'Continue with selected plan'}
                </Text>
              </Pressable>
            ) : null
          ) : (
            <Pressable
              onPress={() => void handleCustomerCenter()}
              accessibilityRole="button"
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
            disabled={restoring}
            accessibilityRole="button"
            accessibilityState={{ disabled: restoring, busy: restoring }}
            style={({ pressed }) => [
              styles.restoreBtn,
              { borderColor: tokens.border, minHeight: MIN_TOUCH_TARGET },
              (pressed || restoring) && { opacity: 0.6 },
            ]}
          >
            <Text style={[typography.button, { color: tokens.accent, fontSize: 15 }]}>
              {restoring ? 'Restoring…' : 'Restore Purchases'}
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

          {!isPro ? (
            <View style={styles.subscriptionDisclosure}>
              <Text style={[typography.meta, styles.disclosureText, { color: tokens.mutedText }]}>
                {disclosureLines.join('\n')}
                {'\n\n'}
                Subscriptions automatically renew unless canceled at least 24 hours before
                the end of the current billing period. Payment will be charged to the
                user&apos;s Apple ID account at confirmation of purchase.
              </Text>
              <View style={styles.legalLinks}>
                <Pressable
                  onPress={() => void openTerms()}
                  accessibilityRole="link"
                  style={({ pressed }) => [styles.legalLink, pressed && { opacity: 0.7 }]}
                >
                  <Text style={[typography.button, styles.legalLinkText, { color: tokens.accent }]}>
                    Terms of Use (EULA)
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void openPrivacyPolicy()}
                  accessibilityRole="link"
                  style={({ pressed }) => [styles.legalLink, pressed && { opacity: 0.7 }]}
                >
                  <Text style={[typography.button, styles.legalLinkText, { color: tokens.accent }]}>
                    Privacy Policy
                  </Text>
                </Pressable>
              </View>
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
  notice: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.lg,
  },
  noticeText: {
    lineHeight: 20,
    textTransform: 'none',
    letterSpacing: 0,
    fontWeight: '400',
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
    marginBottom: spacing.md,
    textTransform: 'none',
    letterSpacing: 0,
    fontWeight: '400',
  },
  subscriptionDisclosure: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  disclosureText: {
    lineHeight: 20,
    textTransform: 'none',
    letterSpacing: 0,
    fontWeight: '400',
  },
  legalLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  legalLink: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
  legalLinkText: {
    fontSize: 15,
  },
});
