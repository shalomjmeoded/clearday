import RevenueCatUI from 'react-native-purchases-ui';

import { isPurchasesSupported } from '@/features/pro/revenueCatConfig';
import { useProStore } from '@/store/proStore';

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
