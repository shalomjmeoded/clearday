# RevenueCat setup — StepsApp / Do! (clearday)

This app uses RevenueCat for **StepsApp Pro** (`pro` entitlement) with monthly, yearly, and lifetime packages.

## 1. Product IDs (must match everywhere)

| Package (RevenueCat) | Store product ID        | Type                          |
| -------------------- | ----------------------- | ----------------------------- |
| `monthly`            | `stepsapp_pro_monthly`  | Auto-renewable subscription   |
| `yearly`             | `stepsapp_pro_yearly`   | Auto-renewable subscription   |
| `lifetime`           | `stepsapp_pro_lifetime` | Non-consumable / one-time     |

Code: [`src/features/pro/products.ts`](src/features/pro/products.ts)

## 2. Entitlement

| Identifier | Display name   |
| ---------- | -------------- |
| `pro`      | StepsApp Pro   |

Attach all three products to this entitlement in RevenueCat.

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

## 4. Apple App Store Connect

1. Create subscription group (e.g. “StepsApp Pro”).
2. Add **auto-renewable subscriptions**:
   - `stepsapp_pro_monthly`
   - `stepsapp_pro_yearly`
3. Add **non-consumable**:
   - `stepsapp_pro_lifetime`
4. Match bundle ID: `com.do.simpletodo`
5. Submit products for review with the app.

## 5. Google Play Console

1. Create subscription product `stepsapp_pro_monthly` with a base plan.
2. Create subscription product `stepsapp_pro_yearly` with a base plan.
3. Create **one-time product** `stepsapp_pro_lifetime`.
4. Match package name: `com.do.simpletodo`
5. Activate products and add license testers.

## 6. RevenueCat dashboard

1. **Create project** → add iOS + Android apps (bundle/package above).
2. **Connect stores** (App Store Connect API key, Play service account).
3. **Products** → import/create the three product IDs.
4. **Entitlements** → create `pro` (StepsApp Pro) → attach all products.
5. **Offerings** → create default offering → add packages:
   - `$rc_monthly` → `monthly` → `stepsapp_pro_monthly`
   - `$rc_annual` → `yearly` → `stepsapp_pro_yearly`
   - `$rc_lifetime` → `lifetime` → `stepsapp_pro_lifetime`
6. Set offering as **Current**.
7. **Paywalls** (optional) → design paywall for the offering.
8. **Customer Center** (optional) → configure paths for manage/cancel/restore.

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

### Sandbox testing

- **iOS**: Sandbox Apple ID in Settings → App Store → Sandbox Account.
- **Android**: License testers in Play Console; internal testing track.
- **RevenueCat**: Use Test Store / sandbox keys during development.

## 9. Troubleshooting

| Symptom | Likely cause |
| ------- | ------------ |
| Empty offerings | Product ID mismatch, offering not “current”, or store products not active |
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
