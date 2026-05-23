import { Platform } from 'react-native';

export function isPurchasesSupported(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

export function getRevenueCatApiKey(): string | null {
  const fallback = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY?.trim() || null;

  if (Platform.OS === 'ios') {
    return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?.trim() || fallback;
  }

  if (Platform.OS === 'android') {
    return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim() || fallback;
  }

  return fallback;
}

export function warnIfMissingRevenueCatKey(): void {
  if (!__DEV__) return;

  if (!getRevenueCatApiKey()) {
    console.warn(
      '[RevenueCat] Missing API key. Set EXPO_PUBLIC_REVENUECAT_API_KEY or ' +
        'EXPO_PUBLIC_REVENUECAT_IOS_API_KEY / EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY in .env'
    );
  }
}
