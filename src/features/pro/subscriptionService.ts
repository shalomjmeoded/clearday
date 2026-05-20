import { Alert } from 'react-native';
import { router } from 'expo-router';

import { useSettingsStore } from '@/store/settingsStore';

/**
 * Subscription abstraction — MVP uses MockSubscriptionProvider (settings.isPro).
 *
 * Phase 2: replace with RevenueCatSubscriptionProvider:
 *   - isPro() → RevenueCat entitlements
 *   - presentPaywall() → RevenueCat paywall / Customer Center
 *   - restorePurchases() → Purchases.restorePurchases() (App Store / Play)
 */
export interface SubscriptionProvider {
  isPro(): Promise<boolean>;
  presentPaywall(): Promise<void>;
  restorePurchases(): Promise<void>;
}

class MockSubscriptionProvider implements SubscriptionProvider {
  async isPro(): Promise<boolean> {
    return useSettingsStore.getState().settings.isPro;
  }

  async presentPaywall(): Promise<void> {
    router.push('/pro');
  }

  async restorePurchases(): Promise<void> {
    Alert.alert(
      'Restore purchases',
      'Purchase restore will be available when real subscriptions are enabled.'
    );
  }
}

/** Swap this instance when RevenueCat is integrated. */
let provider: SubscriptionProvider = new MockSubscriptionProvider();

export function setSubscriptionProvider(next: SubscriptionProvider): void {
  provider = next;
}

export const subscriptionService: SubscriptionProvider = {
  isPro: () => provider.isPro(),
  presentPaywall: () => provider.presentPaywall(),
  restorePurchases: () => provider.restorePurchases(),
};

/** Sync read for UI — backed by SQLite settings.isPro in MVP. */
export function getIsPro(): boolean {
  return useSettingsStore.getState().settings.isPro;
}

export async function canCreateCustomList(): Promise<boolean> {
  if (await subscriptionService.isPro()) return true;
  const { listRepository } = await import('@/features/lists/listRepository');
  const customCount = await listRepository.countCustomLists();
  return customCount < 1;
}

export async function getCustomListLimitMessage(): Promise<string | null> {
  if (await subscriptionService.isPro()) return null;
  const { listRepository } = await import('@/features/lists/listRepository');
  const customCount = await listRepository.countCustomLists();
  if (customCount >= 1) {
    return 'Free includes one custom list. Go Pro for unlimited lists.';
  }
  return null;
}
