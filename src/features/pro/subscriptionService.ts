import Purchases, {
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesOfferings,
  type PurchasesPackage,
} from 'react-native-purchases';

import {
  PRO_ENTITLEMENT_ID,
  REVENUECAT_OFFERING_ID,
  isKnownSubscriptionProduct,
} from '@/features/pro/products';
import {
  getRevenueCatApiKey,
  isPurchasesSupported,
  warnIfMissingRevenueCatKey,
} from '@/features/pro/revenueCatConfig';

export type ProEntitlement = {
  isPro: boolean;
  source: 'revenuecat' | 'unknown';
  expiresAt?: string | null;
};

export type ProPackage = {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  priceString: string;
  productId: string;
  packageType?: string;
};

export interface SubscriptionService {
  configure(): Promise<void>;
  getProStatus(): Promise<ProEntitlement>;
  getOfferings(): Promise<ProPackage[]>;
  purchase(productId: string): Promise<ProEntitlement>;
  restorePurchases(): Promise<ProEntitlement>;
}

let configured = false;
let customerInfoListenerAttached = false;

function configureRevenueCatLogging(): void {
  if (!__DEV__) return;

  Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
  Purchases.setLogHandler((level, message) => {
    const formatted = `[RevenueCat] ${message}`;

    if (message.includes('Purchase was cancelled')) {
      console.debug(formatted);
      return;
    }

    if (level === Purchases.LOG_LEVEL.DEBUG) {
      console.debug(formatted);
    } else if (level === Purchases.LOG_LEVEL.INFO) {
      console.info(formatted);
    } else if (level === Purchases.LOG_LEVEL.WARN) {
      console.warn(formatted);
    } else if (level === Purchases.LOG_LEVEL.ERROR) {
      console.error(formatted);
    } else {
      console.log(formatted);
    }
  });
}

function mapCustomerInfoToEntitlement(info: CustomerInfo | null): ProEntitlement {
  // RevenueCat is the source of truth: when this entitlement is present in
  // CustomerInfo.entitlements.active, the user gets Pro feature unlocks. When
  // it is absent or expires, Pro gates lock again.
  const active = info?.entitlements.active[PRO_ENTITLEMENT_ID];

  if (!active) {
    return {
      isPro: false,
      source: 'revenuecat',
      expiresAt: null,
    };
  }

  return {
    isPro: true,
    source: 'revenuecat',
    expiresAt: active.expirationDate ?? null,
  };
}

function isUserCancelled(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const purchaseError = error as { userCancelled?: boolean; code?: string };

  if (purchaseError.userCancelled) return true;

  return purchaseError.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR;
}

function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const purchaseError = error as { code?: string };

  return (
    purchaseError.code === PURCHASES_ERROR_CODE.NETWORK_ERROR ||
    purchaseError.code === PURCHASES_ERROR_CODE.OFFLINE_CONNECTION_ERROR
  );
}

function mapPackage(pkg: PurchasesPackage): ProPackage {
  return {
    id: pkg.identifier,
    identifier: pkg.identifier,
    title: pkg.product.title,
    description: pkg.product.description,
    priceString: pkg.product.priceString,
    productId: pkg.product.identifier,
    packageType: pkg.packageType,
  };
}

function getDefaultOffering(offerings: PurchasesOfferings): PurchasesOffering | null {
  return offerings.all[REVENUECAT_OFFERING_ID] ?? offerings.current ?? null;
}

function getSubscriptionPackages(offerings: PurchasesOfferings): PurchasesPackage[] {
  const offering = getDefaultOffering(offerings);
  const packages = offering?.availablePackages ?? [];

  return packages.filter((pkg) =>
    isKnownSubscriptionProduct(pkg.product.identifier)
  );
}

function findPackage(offerings: PurchasesOfferings, productId: string): PurchasesPackage | null {
  const packages = getSubscriptionPackages(offerings);

  return (
    packages.find(
      (pkg) =>
        pkg.product.identifier === productId || pkg.identifier === productId
    ) ?? null
  );
}

class RevenueCatSubscriptionService implements SubscriptionService {
  async configure(): Promise<void> {
    if (configured || !isPurchasesSupported()) return;

    const apiKey = getRevenueCatApiKey();
    warnIfMissingRevenueCatKey();

    if (!apiKey) return;

    try {
      configureRevenueCatLogging();

      Purchases.configure({ apiKey });
      configured = true;

      if (!customerInfoListenerAttached) {
        Purchases.addCustomerInfoUpdateListener(() => {
          void import('@/store/proStore').then(({ useProStore }) => {
            void useProStore.getState().refreshProStatus();
          });
        });
        customerInfoListenerAttached = true;
      }
    } catch (error) {
      console.warn('[RevenueCat] configure failed:', error);
    }
  }

  async getProStatus(): Promise<ProEntitlement> {
    if (!configured) {
      return { isPro: false, source: 'unknown' };
    }

    try {
      const info = await Purchases.getCustomerInfo();
      return mapCustomerInfoToEntitlement(info);
    } catch (error) {
      console.warn('[RevenueCat] getProStatus failed:', error);
      return { isPro: false, source: 'unknown' };
    }
  }

  async getOfferings(): Promise<ProPackage[]> {
    if (!configured) return [];

    try {
      const offerings = await Purchases.getOfferings();
      const packages = getSubscriptionPackages(offerings);

      if (!packages.length) return [];

      return packages.map(mapPackage);
    } catch (error) {
      console.warn('[RevenueCat] getOfferings failed:', error);
      return [];
    }
  }

  async purchase(productId: string): Promise<ProEntitlement> {
    if (!configured) {
      throw new Error('Purchases not configured');
    }

    try {
      const offerings = await Purchases.getOfferings();
      const pkg = findPackage(offerings, productId);

      if (!pkg) {
        throw new Error('Product not available');
      }

      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return mapCustomerInfoToEntitlement(customerInfo);
    } catch (error) {
      if (isUserCancelled(error)) {
        throw Object.assign(new Error('Purchase cancelled'), {
          userCancelled: true,
        });
      }

      if (isNetworkError(error)) {
        throw Object.assign(new Error('No internet connection'), {
          networkError: true,
        });
      }

      console.warn('[RevenueCat] purchase failed:', error);
      throw error;
    }
  }

  async restorePurchases(): Promise<ProEntitlement> {
    if (!configured) {
      return { isPro: false, source: 'unknown' };
    }

    try {
      const info = await Purchases.restorePurchases();
      return mapCustomerInfoToEntitlement(info);
    } catch (error) {
      if (isNetworkError(error)) {
        throw Object.assign(new Error('No internet connection'), {
          networkError: true,
        });
      }

      console.warn('[RevenueCat] restore failed:', error);
      throw error;
    }
  }
}

export const revenueCatSubscriptionService = new RevenueCatSubscriptionService();

export async function canCreateCustomList(): Promise<boolean> {
  const { getIsPro } = await import('@/store/proStore');

  if (getIsPro()) return true;

  const { listRepository } = await import('@/features/lists/listRepository');
  const customCount = await listRepository.countCustomLists();

  return customCount < 1;
}

export async function getCustomListLimitMessage(): Promise<string | null> {
  const { getIsPro } = await import('@/store/proStore');

  if (getIsPro()) return null;

  const { listRepository } = await import('@/features/lists/listRepository');
  const customCount = await listRepository.countCustomLists();

  if (customCount >= 1) {
    return 'Free includes one custom list. Go Pro for unlimited lists.';
  }

  return null;
}
