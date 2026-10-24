/** RevenueCat offering configured as Current in the dashboard. */
export const REVENUECAT_OFFERING_ID = 'default';

/** RevenueCat entitlement identifier. Keep this exact dashboard identifier. */
export const PRO_ENTITLEMENT_ID = 'Do! Simple Ad-Free To Do List Pro';

/** App Store / Play Store product IDs - must match store + RevenueCat dashboard. */
export const PRODUCT_IDS = {
  monthly: 'com.do.simpletodo.pro.monthly',
  yearly: 'com.do.simpletodo.pro.yearly',
} as const;

export type ProductId = (typeof PRODUCT_IDS)[keyof typeof PRODUCT_IDS];

export const SUBSCRIPTION_PRODUCT_IDS = new Set<string>([
  PRODUCT_IDS.monthly,
  PRODUCT_IDS.yearly,
]);

export function isKnownSubscriptionProduct(productId: string): productId is ProductId {
  return SUBSCRIPTION_PRODUCT_IDS.has(productId);
}

export function getPlanLabel(productId: string): string {
  if (productId === PRODUCT_IDS.monthly) return 'Monthly';
  if (productId === PRODUCT_IDS.yearly) return 'Yearly';
  return 'Subscription';
}

export function getPlanPeriod(productId: string): string {
  if (productId === PRODUCT_IDS.monthly) return '/ month';
  if (productId === PRODUCT_IDS.yearly) return '/ year';
  return '';
}

/** Compact form used in the legal subscription disclosure. */
export function getPlanBillingPeriod(productId: string): string {
  if (productId === PRODUCT_IDS.monthly) return '/month';
  if (productId === PRODUCT_IDS.yearly) return '/year';
  return '';
}

/**
 * Shown in the subscription disclosure only when live store prices are
 * unavailable (offline, offerings failed). The disclosure is required by App
 * Store review and must render regardless, so this cannot simply be omitted.
 * Keep in sync with App Store Connect; live prices always win and are
 * correctly localized.
 */
export const FALLBACK_PRICE_STRINGS: Record<ProductId, string> = {
  [PRODUCT_IDS.monthly]: '$3.99',
  [PRODUCT_IDS.yearly]: '$19.99',
};
