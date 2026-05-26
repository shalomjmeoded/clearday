import RevenueCatUI from 'react-native-purchases-ui';

import { isPurchasesSupported } from '@/features/pro/revenueCatConfig';
import { useProStore } from '@/store/proStore';

/** Open RevenueCat Customer Center (manage subscription, restore, support paths). */
export async function presentCustomerCenter(): Promise<boolean> {
  if (!isPurchasesSupported()) {
    console.info('[RevenueCat] Customer Center is not supported on this platform.');
    return false;
  }

  try {
    await RevenueCatUI.presentCustomerCenter();
    await useProStore.getState().refreshProStatus();
    return true;
  } catch (error) {
    console.warn('[RevenueCat] presentCustomerCenter failed:', error);
    return false;
  }
}
