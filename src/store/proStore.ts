import { create } from 'zustand';

import type { ProEntitlement, ProPackage } from '@/features/pro/subscriptionService';
import {
  NoSubscriptionPackagesError,
  PurchasesNotConfiguredError,
  revenueCatSubscriptionService,
} from '@/features/pro/subscriptionService';

interface ProState {
  isPro: boolean;
  loading: boolean;
  offerings: ProPackage[];
  error: string | null;
  lastUpdatedAt: string | null;
  activeProductId: string | null;
  purchasing: boolean;
  initializePurchases: () => Promise<void>;
  refreshProStatus: () => Promise<void>;
  loadOfferings: () => Promise<void>;
  purchase: (productId: string) => Promise<void>;
  restorePurchases: () => Promise<{ restored: boolean; message: string }>;
}

export const useProStore = create<ProState>((set, get) => ({
  isPro: false,
  loading: false,
  offerings: [],
  error: null,
  lastUpdatedAt: null,
  activeProductId: null,
  purchasing: false,

  initializePurchases: async () => {
    set({ loading: true, error: null });

    try {
      await revenueCatSubscriptionService.configure();
      await get().refreshProStatus();
      await get().loadOfferings();
    } catch {
      set({ error: 'Could not load subscriptions.' });
    } finally {
      set({ loading: false });
    }
  },

  refreshProStatus: async () => {
    try {
      const entitlement = await revenueCatSubscriptionService.getProStatus();

      set({
        isPro: entitlement.isPro,
        activeProductId: entitlement.productId ?? null,
        lastUpdatedAt: new Date().toISOString(),
      });
    } catch {
      set({
        isPro: false,
        activeProductId: null,
        lastUpdatedAt: new Date().toISOString(),
      });
    }
  },

  loadOfferings: async () => {
    set({ loading: true, error: null });

    try {
      const offerings = await revenueCatSubscriptionService.getOfferings();

      set({
        offerings,
        error:
          offerings.length === 0 ? 'Plans are unavailable right now.' : null,
      });
    } catch (error) {
      if (error instanceof PurchasesNotConfiguredError) {
        set({
          offerings: [],
          error:
            'Subscriptions are not configured in this build. Add the RevenueCat public SDK key to EAS and rebuild.',
        });
        return;
      }

      if (error instanceof NoSubscriptionPackagesError) {
        set({
          offerings: [],
          error:
            'No subscription products are available yet. Check the RevenueCat offering and App Store product setup.',
        });
        return;
      }

      set({
        offerings: [],
        error: 'Could not load plans. Try again.',
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
        lastUpdatedAt: new Date().toISOString(),
        purchasing: false,
        error: null,
      });
    } catch (error) {
      set({ purchasing: false });

      if (
        error &&
        typeof error === 'object' &&
        'userCancelled' in error &&
        (error as { userCancelled?: boolean }).userCancelled
      ) {
        return;
      }

      if (
        error &&
        typeof error === 'object' &&
        'networkError' in error &&
        (error as { networkError?: boolean }).networkError
      ) {
        set({ error: 'No internet connection. Try again when you are online.' });
        return;
      }

      set({ error: 'Purchase failed. Try again.' });
    }
  },

  restorePurchases: async () => {
    set({ loading: true, error: null });

    try {
      const entitlement = await revenueCatSubscriptionService.restorePurchases();
      const restored = entitlement.isPro;

      set({
        isPro: restored,
        activeProductId: entitlement.productId ?? null,
        loading: false,
        lastUpdatedAt: new Date().toISOString(),
      });

      return {
        restored,
        message: restored
          ? 'Pro restored.'
          : 'No previous Pro purchase was found.',
      };
    } catch (error) {
      set({ loading: false });

      if (
        error &&
        typeof error === 'object' &&
        'networkError' in error &&
        (error as { networkError?: boolean }).networkError
      ) {
        const message = 'Could not restore purchases. Try again.';
        set({ error: message });
        return { restored: false, message };
      }

      const message = 'Could not restore purchases. Try again.';
      set({ error: message });
      return { restored: false, message };
    }
  },
}));

export function getIsPro(): boolean {
  return useProStore.getState().isPro;
}
