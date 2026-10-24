import RevenueCatUI from 'react-native-purchases-ui';

import { isPurchasesSupported } from '@/features/pro/revenueCatConfig';
import { useProStore } from '@/store/proStore';

/**
 * presentCustomerCenter resolves only once the sheet is dismissed, so this is
 * deliberately long: it is a safety net for a native call that never settles,
 * not a limit on how long the user may read the sheet. Too short a value makes
 * the caller fall back to the App Store URL while the Customer Center is
 * happily open, stacking two subscription screens on top of each other.
 */
const CUSTOMER_CENTER_HANG_TIMEOUT_MS = 20_000;

/** Open RevenueCat Customer Center (manage subscription, restore, support paths). */
export async function presentCustomerCenter(): Promise<boolean> {
  if (!isPurchasesSupported()) {
    console.info('[RevenueCat] Customer Center is not supported on this platform.');
    return false;
  }

  let hangTimer: ReturnType<typeof setTimeout> | undefined;

  try {
    const presented = await Promise.race([
      RevenueCatUI.presentCustomerCenter().then(() => true),
      new Promise<false>((resolve) => {
        hangTimer = setTimeout(() => {
          console.warn('[RevenueCat] Customer Center did not respond; falling back.');
          resolve(false);
        }, CUSTOMER_CENTER_HANG_TIMEOUT_MS);
      }),
    ]);

    if (!presented) return false;

    await useProStore.getState().refreshProStatus();
    return true;
  } catch (error) {
    console.warn('[RevenueCat] presentCustomerCenter failed:', error);
    return false;
  } finally {
    if (hangTimer) clearTimeout(hangTimer);
  }
}
