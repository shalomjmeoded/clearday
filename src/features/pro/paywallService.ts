import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

import { PRO_ENTITLEMENT_ID } from '@/features/pro/products';
import { isPurchasesSupported } from '@/features/pro/revenueCatConfig';
import { useProStore } from '@/store/proStore';

export type PaywallFlowResult =
  | 'purchased'
  | 'restored'
  | 'cancelled'
  | 'not_presented'
  | 'error';

function mapPaywallResult(result: PAYWALL_RESULT): PaywallFlowResult {
  switch (result) {
    case PAYWALL_RESULT.PURCHASED:
      return 'purchased';
    case PAYWALL_RESULT.RESTORED:
      return 'restored';
    case PAYWALL_RESULT.CANCELLED:
      return 'cancelled';
    case PAYWALL_RESULT.NOT_PRESENTED:
      return 'not_presented';
    default:
      return 'error';
  }
}

async function refreshAfterPaywall(result: PaywallFlowResult): Promise<PaywallFlowResult> {
  if (result === 'purchased' || result === 'restored') {
    await useProStore.getState().refreshProStatus();
  }

  return result;
}

/** Present the RevenueCat-hosted paywall for the current offering. */
export async function presentRevenueCatPaywall(): Promise<PaywallFlowResult> {
  if (!isPurchasesSupported()) return 'not_presented';

  try {
    const result = await RevenueCatUI.presentPaywall();
    return refreshAfterPaywall(mapPaywallResult(result));
  } catch (error) {
    console.warn('[RevenueCat] presentPaywall failed:', error);
    return 'error';
  }
}

/** Present paywall only when StepsApp Pro is not active. */
export async function presentPaywallIfNeeded(): Promise<PaywallFlowResult> {
  if (!isPurchasesSupported()) return 'not_presented';

  try {
    const result = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: PRO_ENTITLEMENT_ID,
    });
    return refreshAfterPaywall(mapPaywallResult(result));
  } catch (error) {
    console.warn('[RevenueCat] presentPaywallIfNeeded failed:', error);
    return 'error';
  }
}

/** Open RevenueCat Customer Center (manage subscription, restore, support paths). */
export async function presentCustomerCenter(): Promise<void> {
  if (!isPurchasesSupported()) return;

  try {
    await RevenueCatUI.presentCustomerCenter();
    await useProStore.getState().refreshProStatus();
  } catch (error) {
    console.warn('[RevenueCat] presentCustomerCenter failed:', error);
  }
}
