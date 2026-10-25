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
  SUBSCRIPTION_PRODUCT_IDS,
  isKnownSubscriptionProduct,
} from '@/features/pro/products';
import {
  getRevenueCatApiKey,
  isDev,
  isPurchasesSupported,
  warnIfMissingRevenueCatKey,
} from '@/features/pro/revenueCatConfig';

export type ProEntitlement = {
  isPro: boolean;
  source: 'revenuecat' | 'unknown';
  productId?: string | null;
  expiresAt?: string | null;
  /**
   * Set when the store reported a billing problem (e.g. a declined card).
   * Pro is usually still active during the grace period, so this is a warning
   * to act, not a reason to lock features.
   */
  billingIssueDetectedAt?: string | null;
  /** False once the user cancels; access continues until `expiresAt`. */
  willRenew?: boolean;
};

export type ProPackage = {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  priceString: string;
  /** Numeric price in `currencyCode`, when the store provides one. */
  price?: number;
  currencyCode?: string;
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
let configurePromise: Promise<void> | null = null;
let customerInfoListenerAttached = false;

export type NotConfiguredReason = 'unsupported' | 'missing-key' | 'failed';

export class PurchasesNotConfiguredError extends Error {
  constructor(public reason: NotConfiguredReason) {
    super(`Purchases not configured (${reason})`);
    this.name = 'PurchasesNotConfiguredError';
  }
}

function getNotConfiguredReason(): NotConfiguredReason {
  if (!isPurchasesSupported()) return 'unsupported';
  if (!getRevenueCatApiKey()) return 'missing-key';
  return 'failed';
}

export class NoSubscriptionPackagesError extends Error {
  constructor() {
    super('No subscription packages available');
    this.name = 'NoSubscriptionPackagesError';
  }
}

function configureRevenueCatLogging(): void {
  if (!isDev()) return;

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

/**
 * PRO_ENTITLEMENT_ID is a free-text dashboard identifier, so a typo or a
 * renamed entitlement silently produces "purchase succeeded but Pro never
 * unlocks". Log what RevenueCat actually returned so that failure mode is
 * diagnosable instead of mysterious.
 */
function warnOnEntitlementMismatch(info: CustomerInfo | null): void {
  if (!isDev()) return;

  const activeKeys = Object.keys(info?.entitlements.active ?? {});
  const allKeys = Object.keys(info?.entitlements.all ?? {});

  if (!activeKeys.length && !allKeys.length) return;

  console.warn(
    `[RevenueCat] Expected entitlement "${PRO_ENTITLEMENT_ID}" was not active. ` +
      'Check that it matches the RevenueCat dashboard identifier exactly.',
    { activeEntitlements: activeKeys, allEntitlements: allKeys }
  );
}

function mapCustomerInfoToEntitlement(info: CustomerInfo | null): ProEntitlement {
  // RevenueCat is the source of truth: when this entitlement is present in
  // CustomerInfo.entitlements.active, the user gets Pro feature unlocks. When
  // it is absent or expires, Pro gates lock again.
  const active = info?.entitlements.active[PRO_ENTITLEMENT_ID];

  if (!active) {
    warnOnEntitlementMismatch(info);

    return {
      isPro: false,
      source: 'revenuecat',
      productId: null,
      expiresAt: null,
      billingIssueDetectedAt: null,
      willRenew: false,
    };
  }

  return {
    isPro: true,
    source: 'revenuecat',
    productId: active.productIdentifier,
    expiresAt: active.expirationDate ?? null,
    billingIssueDetectedAt: active.billingIssueDetectedAt ?? null,
    willRenew: active.willRenew,
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

export type PurchaseFailureReason =
  | 'cancelled'
  | 'network'
  | 'pending'
  | 'already-owned'
  | 'not-allowed'
  | 'store-problem'
  | 'product-unavailable'
  | 'not-configured'
  | 'unknown';

export class PurchaseFlowError extends Error {
  constructor(message: string, public reason: PurchaseFailureReason) {
    super(message);
    this.name = 'PurchaseFlowError';
  }
}

function classifyPurchaseError(error: unknown): PurchaseFailureReason {
  if (isUserCancelled(error)) return 'cancelled';
  if (isNetworkError(error)) return 'network';

  if (!error || typeof error !== 'object') return 'unknown';
  const code = (error as { code?: string }).code;

  if (code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return 'pending';
  if (
    code === PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR ||
    code === PURCHASES_ERROR_CODE.RECEIPT_ALREADY_IN_USE_ERROR
  ) {
    return 'already-owned';
  }
  if (code === PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR) return 'not-allowed';
  if (code === PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR) return 'store-problem';

  return 'unknown';
}

function mapPackage(pkg: PurchasesPackage): ProPackage {
  return {
    id: pkg.identifier,
    identifier: pkg.identifier,
    title: pkg.product.title,
    description: pkg.product.description,
    priceString: pkg.product.priceString,
    price: typeof pkg.product.price === 'number' ? pkg.product.price : undefined,
    currencyCode: pkg.product.currencyCode || undefined,
    productId: pkg.product.identifier,
    packageType: pkg.packageType,
  };
}

function knownPackagesIn(offering: PurchasesOffering | null | undefined): PurchasesPackage[] {
  return (offering?.availablePackages ?? []).filter((pkg) =>
    isKnownSubscriptionProduct(pkg.product.identifier)
  );
}

/**
 * Candidate offerings in priority order. The dashboard's *current* offering
 * wins: renaming it (and leaving an empty legacy `default` behind) must not
 * strand the paywall on an offering with no packages. The configured ID is a
 * fallback, and every other offering is a last resort so a dashboard rename
 * degrades to "slightly wrong plan order" rather than "no plans at all".
 */
function getOfferingCandidates(offerings: PurchasesOfferings): PurchasesOffering[] {
  const candidates = [
    offerings.current,
    offerings.all?.[REVENUECAT_OFFERING_ID],
    ...Object.values(offerings.all ?? {}),
  ].filter((offering): offering is PurchasesOffering => Boolean(offering));

  const seen = new Set<string>();
  return candidates.filter((offering) => {
    if (seen.has(offering.identifier)) return false;
    seen.add(offering.identifier);
    return true;
  });
}

function getSubscriptionPackages(offerings: PurchasesOfferings): PurchasesPackage[] {
  for (const offering of getOfferingCandidates(offerings)) {
    const packages = knownPackagesIn(offering);
    if (packages.length) return packages;
  }

  return [];
}

/** Exposed for unit tests; use getOfferings() in app code. */
export const __getSubscriptionPackages = getSubscriptionPackages;

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
  // Retriable: a failed attempt clears the in-flight promise so the next call
  // (e.g. the paywall's Retry button) re-attempts configuration instead of
  // leaving the session permanently unconfigured.
  async configure(): Promise<void> {
    if (configured || !isPurchasesSupported()) return;
    if (configurePromise) return configurePromise;

    configurePromise = (async () => {
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
    })().finally(() => {
      configurePromise = null;
    });

    return configurePromise;
  }

  async getProStatus(): Promise<ProEntitlement> {
    await this.configure();

    if (!configured) {
      return { isPro: false, source: 'unknown', productId: null };
    }

    try {
      const info = await Purchases.getCustomerInfo();
      return mapCustomerInfoToEntitlement(info);
    } catch (error) {
      console.warn('[RevenueCat] getProStatus failed:', error);
      return { isPro: false, source: 'unknown', productId: null };
    }
  }

  async getOfferings(): Promise<ProPackage[]> {
    await this.configure();

    if (!configured) {
      throw new PurchasesNotConfiguredError(getNotConfiguredReason());
    }

    try {
      const offerings = await Purchases.getOfferings();
      const packages = getSubscriptionPackages(offerings);

      if (!packages.length) {
        // Nothing matched in ANY offering, so dump enough to tell apart the
        // two usual causes: products missing/not approved in the store, vs.
        // product IDs that do not match PRODUCT_IDS.
        console.warn('[RevenueCat] No known subscription packages in any offering:', {
          preferredOfferingId: REVENUECAT_OFFERING_ID,
          currentOfferingId: offerings.current?.identifier ?? null,
          offeringIds: Object.keys(offerings.all ?? {}),
          productIdsSeen: Object.values(offerings.all ?? {}).flatMap((offering) =>
            (offering?.availablePackages ?? []).map((pkg) => pkg.product.identifier)
          ),
          expectedProductIds: [...SUBSCRIPTION_PRODUCT_IDS],
        });
        throw new NoSubscriptionPackagesError();
      }

      return packages.map(mapPackage);
    } catch (error) {
      if (error instanceof NoSubscriptionPackagesError) {
        throw error;
      }

      console.warn('[RevenueCat] getOfferings failed:', error);

      if (isNetworkError(error)) {
        throw Object.assign(new Error('No internet connection'), {
          networkError: true,
        });
      }

      throw error;
    }
  }

  async purchase(productId: string): Promise<ProEntitlement> {
    await this.configure();

    if (!configured) {
      throw new PurchaseFlowError('Purchases not configured', 'not-configured');
    }

    try {
      const offerings = await Purchases.getOfferings();
      const pkg = findPackage(offerings, productId);

      if (!pkg) {
        throw new PurchaseFlowError('Product not available', 'product-unavailable');
      }

      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return mapCustomerInfoToEntitlement(customerInfo);
    } catch (error) {
      if (error instanceof PurchaseFlowError) {
        throw error;
      }

      const reason = classifyPurchaseError(error);

      if (reason !== 'cancelled') {
        console.warn('[RevenueCat] purchase failed:', error);
      }

      throw new PurchaseFlowError(
        error instanceof Error ? error.message : 'Purchase failed',
        reason
      );
    }
  }

  async restorePurchases(): Promise<ProEntitlement> {
    await this.configure();

    if (!configured) {
      return { isPro: false, source: 'unknown', productId: null };
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
