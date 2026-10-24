import { create } from 'zustand';

import { readCachedEntitlement, writeCachedEntitlement } from '@/features/pro/proEntitlementCache';
import type { ProEntitlement, ProPackage } from '@/features/pro/subscriptionService';
import {
  NoSubscriptionPackagesError,
  PurchaseFlowError,
  PurchasesNotConfiguredError,
  revenueCatSubscriptionService,
} from '@/features/pro/subscriptionService';

/** What the user can usefully do about a failure, so the UI offers that action. */
export type ProErrorAction = 'retry-plans' | 'retry-purchase' | 'restore' | 'none';

export type ProError = {
  message: string;
  action: ProErrorAction;
};

/** Non-blocking status note about an otherwise-active subscription. */
export type ProNotice = {
  message: string;
  tone: 'warning' | 'info';
};

interface ProState {
  isPro: boolean;
  /** True while Pro comes from the local cache and RevenueCat has not answered yet. */
  provisional: boolean;
  hydrated: boolean;
  /** Billing problem or pending cancellation on an active subscription. */
  notice: ProNotice | null;
  loading: boolean;
  restoring: boolean;
  offerings: ProPackage[];
  error: ProError | null;
  lastUpdatedAt: string | null;
  activeProductId: string | null;
  purchasing: boolean;
  hydrateProStatus: () => Promise<void>;
  initializePurchases: () => Promise<void>;
  recoverOnForeground: () => Promise<void>;
  refreshProStatus: () => Promise<void>;
  loadOfferings: () => Promise<void>;
  purchase: (productId: string) => Promise<void>;
  restorePurchases: () => Promise<{ restored: boolean; message: string }>;
}

function notConfiguredError(error: PurchasesNotConfiguredError): ProError {
  if (error.reason === 'unsupported') {
    return {
      message:
        'Subscriptions are not available on this platform. Use the iOS or Android app to go Pro.',
      action: 'none',
    };
  }

  if (error.reason === 'missing-key') {
    return {
      message:
        'Subscriptions are not configured in this build. Add the RevenueCat public SDK key to EAS and rebuild.',
      action: 'none',
    };
  }

  return {
    message: 'Could not reach the subscription service. Check your connection and retry.',
    action: 'retry-plans',
  };
}

function purchaseError(error: PurchaseFlowError): ProError | null {
  switch (error.reason) {
    case 'cancelled':
      return null;
    case 'network':
      return {
        message: 'No internet connection. Try again when you are online.',
        action: 'retry-purchase',
      };
    case 'pending':
      return {
        message:
          'Your purchase is awaiting approval (Ask to Buy). Pro unlocks automatically once it is approved.',
        action: 'none',
      };
    case 'already-owned':
      return {
        message: 'This subscription is already linked to your store account.',
        action: 'restore',
      };
    case 'not-allowed':
      return {
        message:
          'Purchases are not allowed on this device. Check parental controls or payment restrictions, then try again.',
        action: 'none',
      };
    case 'store-problem':
      return {
        message: 'The App Store had a problem processing the purchase. Try again in a moment.',
        action: 'retry-purchase',
      };
    case 'product-unavailable':
      return {
        message: 'That plan is currently unavailable. Reload plans and try again.',
        action: 'retry-plans',
      };
    case 'not-configured':
      return {
        message: 'Subscriptions are unavailable right now. Reload plans and try again.',
        action: 'retry-plans',
      };
    default:
      return { message: 'Purchase failed. Try again.', action: 'retry-purchase' };
  }
}

function formatExpiry(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null;

  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * A billing problem or a cancellation does not revoke Pro — access continues
 * until the period ends — so these are surfaced as notices the user can act
 * on, never as gates.
 */
function buildNotice(entitlement: ProEntitlement): ProNotice | null {
  if (!entitlement.isPro) return null;

  if (entitlement.billingIssueDetectedAt) {
    const until = formatExpiry(entitlement.expiresAt);

    return {
      message: until
        ? `There is a billing problem with your subscription. Update your payment method to keep Pro past ${until}.`
        : 'There is a billing problem with your subscription. Update your payment method to keep Pro.',
      tone: 'warning',
    };
  }

  if (entitlement.willRenew === false) {
    const until = formatExpiry(entitlement.expiresAt);

    return {
      message: until
        ? `Your subscription is canceled. Pro stays active until ${until}.`
        : 'Your subscription is canceled and will not renew.',
      tone: 'info',
    };
  }

  return null;
}

function isNetworkFlagged(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'networkError' in error &&
      (error as { networkError?: boolean }).networkError
  );
}

export const useProStore = create<ProState>((set, get) => ({
  isPro: false,
  provisional: false,
  hydrated: false,
  notice: null,
  loading: false,
  restoring: false,
  offerings: [],
  error: null,
  lastUpdatedAt: null,
  activeProductId: null,
  purchasing: false,

  // Runs during bootstrap before the UI is interactive, so Pro gates
  // (themes, custom lists, recurring quick-add) never misfire for a paying
  // user during the RevenueCat round-trip.
  hydrateProStatus: async () => {
    if (get().hydrated) return;

    const cached = await readCachedEntitlement();

    if (!cached) {
      set({ hydrated: true });
      return;
    }

    set({
      isPro: cached.isPro,
      activeProductId: cached.productId,
      provisional: true,
      hydrated: true,
    });
  },

  initializePurchases: async () => {
    set({ loading: true, error: null });

    try {
      await revenueCatSubscriptionService.configure();
      await get().refreshProStatus();
      await get().loadOfferings();
    } catch {
      // Each step reports its own failure into `error`; this only stops an
      // unexpected throw from becoming an unhandled rejection at startup.
    } finally {
      set({ loading: false });
    }
  },

  // Called when the app returns to the foreground. Besides refreshing the
  // entitlement, this retries a plans load that failed for a reason that can
  // fix itself (offline, service unreachable) — the common case being a
  // paywall opened offline, then reconnected. Failures that can never resolve
  // without a new build (missing key, unsupported platform) are left alone.
  recoverOnForeground: async () => {
    await get().refreshProStatus();

    const { loading, offerings, error } = get();

    if (loading || offerings.length > 0) return;
    if (error?.action !== 'retry-plans') return;

    await get().loadOfferings();
  },

  refreshProStatus: async () => {
    try {
      const entitlement = await revenueCatSubscriptionService.getProStatus();

      // 'unknown' means we could not get an authoritative answer (not
      // configured, or the SDK call failed). Keep whatever we already have —
      // cached or previously confirmed — instead of locking a paying user out.
      if (entitlement.source === 'unknown') return;

      set({
        isPro: entitlement.isPro,
        activeProductId: entitlement.productId ?? null,
        provisional: false,
        notice: buildNotice(entitlement),
        lastUpdatedAt: new Date().toISOString(),
      });

      await writeCachedEntitlement({
        isPro: entitlement.isPro,
        productId: entitlement.productId ?? null,
        expiresAt: entitlement.expiresAt ?? null,
      });
    } catch {
      // Keep last known state on unexpected failures too.
    }
  },

  loadOfferings: async () => {
    set({ loading: true, error: null });

    try {
      const offerings = await revenueCatSubscriptionService.getOfferings();
      set({ offerings, error: null });
    } catch (error) {
      if (error instanceof PurchasesNotConfiguredError) {
        set({ offerings: [], error: notConfiguredError(error) });
        return;
      }

      if (error instanceof NoSubscriptionPackagesError) {
        set({
          offerings: [],
          error: {
            message:
              'No subscription products are available yet. Check the RevenueCat offering and App Store product setup.',
            action: 'retry-plans',
          },
        });
        return;
      }

      if (isNetworkFlagged(error)) {
        set({
          offerings: [],
          error: {
            message: 'No internet connection. Plans will load when you are back online.',
            action: 'retry-plans',
          },
        });
        return;
      }

      set({
        offerings: [],
        error: { message: 'Could not load plans. Try again.', action: 'retry-plans' },
      });
    } finally {
      set({ loading: false });
    }
  },

  purchase: async (productId) => {
    set({ purchasing: true, error: null });

    try {
      const entitlement = await revenueCatSubscriptionService.purchase(productId);

      set({
        isPro: entitlement.isPro,
        activeProductId: entitlement.productId ?? null,
        provisional: false,
        notice: buildNotice(entitlement),
        lastUpdatedAt: new Date().toISOString(),
        purchasing: false,
      });

      await writeCachedEntitlement({
        isPro: entitlement.isPro,
        productId: entitlement.productId ?? null,
        expiresAt: entitlement.expiresAt ?? null,
      });

      if (!entitlement.isPro) {
        // The store accepted the purchase but the Pro entitlement is not
        // active. Usually a deferred/pending payment, or an entitlement ID
        // that does not match the RevenueCat dashboard.
        // mapCustomerInfoToEntitlement already logs the entitlement keys
        // RevenueCat returned, which is what makes this diagnosable.
        set({
          error: {
            message:
              'Your purchase went through, but Pro has not unlocked yet. Tap Restore Purchases, or reopen the app in a moment.',
            action: 'restore',
          },
        });
        return;
      }

      set({ error: null });
    } catch (error) {
      const next =
        error instanceof PurchaseFlowError
          ? purchaseError(error)
          : { message: 'Purchase failed. Try again.', action: 'retry-purchase' as const };

      set({ purchasing: false, error: next });
    }
  },

  restorePurchases: async () => {
    set({ restoring: true, error: null });

    try {
      const entitlement = await revenueCatSubscriptionService.restorePurchases();

      if (entitlement.source === 'unknown') {
        // Restore could not run (purchases unavailable / not configured):
        // keep the last known entitlement and report the failure honestly.
        const message = 'Could not restore purchases right now. Try again.';
        set({ restoring: false, error: { message, action: 'restore' } });
        return { restored: false, message };
      }

      const restored = entitlement.isPro;

      set({
        isPro: restored,
        activeProductId: entitlement.productId ?? null,
        provisional: false,
        notice: buildNotice(entitlement),
        lastUpdatedAt: new Date().toISOString(),
        restoring: false,
      });

      await writeCachedEntitlement({
        isPro: restored,
        productId: entitlement.productId ?? null,
        expiresAt: entitlement.expiresAt ?? null,
      });

      return {
        restored,
        message: restored ? 'Pro restored.' : 'No previous Pro purchase was found.',
      };
    } catch (error) {
      const message = isNetworkFlagged(error)
        ? 'No internet connection. Try restoring again when you are online.'
        : 'Could not restore purchases. Try again.';

      set({ restoring: false, error: { message, action: 'restore' } });
      return { restored: false, message };
    }
  },
}));

export function getIsPro(): boolean {
  return useProStore.getState().isPro;
}
