/** RevenueCat entitlement identifier (dashboard display name: StepsApp Pro). */
export const PRO_ENTITLEMENT_ID = 'pro';

/** App Store / Play Store product IDs — must match store + RevenueCat dashboard. */
export const PRODUCT_IDS = {
  monthly: 'stepsapp_pro_monthly',
  yearly: 'stepsapp_pro_yearly',
  lifetime: 'stepsapp_pro_lifetime',
} as const;

/** RevenueCat offering package identifiers (default offering). */
export const PACKAGE_IDENTIFIERS = {
  monthly: 'monthly',
  yearly: 'yearly',
  lifetime: 'lifetime',
} as const;

export type ProductId = (typeof PRODUCT_IDS)[keyof typeof PRODUCT_IDS];

/** Shown on the Pro screen — must match App Store / Play Console pricing. */
export const PLAN_DISPLAY_PRICES: Record<ProductId, string> = {
  [PRODUCT_IDS.monthly]: '$4',
  [PRODUCT_IDS.yearly]: '$14',
  [PRODUCT_IDS.lifetime]: '$34',
};

export function getPlanDisplayPrice(productId: string): string | undefined {
  return PLAN_DISPLAY_PRICES[productId as ProductId];
}
