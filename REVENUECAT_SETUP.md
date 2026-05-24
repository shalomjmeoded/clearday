# RevenueCat setup - Do! (clearday)

This app uses RevenueCat for **Do! Simple Ad-Free To Do List Pro** with monthly and yearly subscriptions in the `default` offering.

## 1. Product IDs (must match everywhere)

| Package (RevenueCat) | Store product ID                   | Type                        |
| -------------------- | ---------------------------------- | --------------------------- |
| `$rc_monthly`        | `com.do.simpletodo.pro.monthly`    | Auto-renewable subscription |
| `$rc_annual`         | `com.do.simpletodo.pro.yearly`     | Auto-renewable subscription |

Code: [`src/features/pro/products.ts`](src/features/pro/products.ts)

## 2. Entitlement

| Identifier | Display name |
| ---------- | ------------ |
| `Do! Simple Ad-Free To Do List Pro` | Do! Simple Ad-Free To Do List Pro |

Attach both subscription products to this entitlement in RevenueCat. The app unlocks Pro features when this entitlement appears in `CustomerInfo.entitlements.active`.

## 3. Environment variables

Create `.env` from [`.env.example`](.env.example):

```bash
EXPO_PUBLIC_REVENUECAT_API_KEY=your_test_or_platform_key
```

Optional production keys:

```bash
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_...
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_...
```

Config: [`src/features/pro/revenueCatConfig.ts`](src/features/pro/revenueCatConfig.ts)

**Never commit real keys.** `.env` is gitignored.

Add the Do! iOS public SDK key locally like this:

```bash
EXPO_PUBLIC_REVENUECAT_API_KEY=appl_xxxxx
```

Use `.env` for local development and EAS environment variables for cloud builds. This is a public SDK key, but `.env` should still stay uncommitted.

## 4. Apple App Store Connect

1. Create subscription group (e.g. "Do! Pro").
2. Add **auto-renewable subscriptions**:
   - `com.do.simpletodo.pro.monthly`
   - `com.do.simpletodo.pro.yearly`
3. Match bundle ID: `com.do.simpletodo`.
4. Submit products for review with the app.

## 5. Google Play Console

1. Create subscription product `com.do.simpletodo.pro.monthly` with a base plan.
2. Create subscription product `com.do.simpletodo.pro.yearly` with a base plan.
3. Match package name: `com.do.simpletodo`.
4. Activate products and add license testers.

## 6. RevenueCat dashboard

1. **Create project** → add iOS + Android apps (bundle/package above).
2. **Connect stores** (App Store Connect API key, Play service account).
3. **Products** -> import/create the two product IDs.
4. **Entitlements** -> create `Do! Simple Ad-Free To Do List Pro` -> attach both products.
5. **Offerings** -> create `default` offering -> add packages:
   - `$rc_monthly` -> `com.do.simpletodo.pro.monthly`
   - `$rc_annual` -> `com.do.simpletodo.pro.yearly`
6. Set offering as **Current**.
7. **Paywalls** (optional) -> design paywall for the offering.
8. **Customer Center** (optional) -> configure paths for manage/cancel/restore.

## 7. App architecture

| Layer | File |
| ----- | ---- |
| Products / entitlement IDs | `src/features/pro/products.ts` |
| API keys | `src/features/pro/revenueCatConfig.ts` |
| Purchases API | `src/features/pro/subscriptionService.ts` |
| Paywall + Customer Center | `src/features/pro/paywallService.ts` |
| App state | `src/store/proStore.ts` |
| Pro UI | `app/pro.tsx` |
| Startup configure | `app/_layout.tsx` |

## 8. Build & test (EAS)

Expo Go uses RevenueCat **Preview API Mode** (mock only). Real purchases need a **development build**:

```bash
npm install
cp .env.example .env   # add your API key
npx eas login
npx eas build:configure
npx eas build --platform ios --profile development
# or
npx eas build --platform android --profile development
```

Run dev server after installing the build:

```bash
npx expo start --dev-client
```

For EAS cloud builds, add the API key before building:

```bash
eas env:create --environment development --name EXPO_PUBLIC_REVENUECAT_API_KEY --value appl_xxxxx
eas env:create --environment production --name EXPO_PUBLIC_REVENUECAT_API_KEY --value appl_xxxxx
```

No custom native config plugin is required for `react-native-purchases` in an Expo development/production build. Native purchases do not work in Expo Go; rebuild the dev client after adding or upgrading the SDK.

### Sandbox testing

- **iOS**: Use a Sandbox Apple Account from App Store Connect. On current iOS versions, sign in from Settings when prompted by the purchase sheet or from the App Store sandbox account settings.
- **iOS simulator**: RevenueCat documents sandbox purchase testing support on iOS 14+ simulators, but real-device and TestFlight testing is still the best final check.
- **Android**: License testers in Play Console; internal testing track.
- **RevenueCat**: Use Test Store / sandbox keys during development.

## 9. Troubleshooting

| Symptom | Likely cause |
| ------- | ------------ |
| Empty offerings | Product ID mismatch, `default` offering not current, or store products not active |
| `Missing API key` warning | No `.env` / env vars not loaded — restart Metro after adding `.env` |
| Purchases fail in Expo Go | Expected — use EAS dev build |
| Product not found | Store product not approved; wrong bundle ID / package name |
| Restore finds nothing | Different Apple ID / Play account than original purchase |
| App not signed | Use release or development build, not unsigned sideload |

## 10. Submit to stores

```bash
npx eas build --platform all --profile production
npx eas submit --platform ios --profile production
npx eas submit --platform android --profile production
```
