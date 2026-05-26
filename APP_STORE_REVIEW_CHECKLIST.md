# App Store Review Checklist

Use this before each iOS submission. Last checked against Apple guidance on
2026-05-26.

## App Store Connect

- Use the public privacy policy URL:
  `https://shalomjmeoded.github.io/clearday/privacy.html`.
- Enable GitHub Pages from the repository `docs/` folder before submission.
- In App Privacy, disclose RevenueCat purchase collection. RevenueCat says apps
  using the SDK must disclose Purchases information.
- Keep tracking set to No unless an advertising/attribution SDK is added.
- Complete subscription metadata for each product:
  - Reference name and product ID match RevenueCat and `src/features/pro/products.ts`.
  - Duration is monthly or yearly as appropriate.
  - Price is correct in every storefront.
  - Subscription group has a display name.
  - Review screenshot shows the Pro screen.
- Add specific review notes:
  - Core tasks/lists/reminders are usable without an account.
  - Task data is stored locally on device.
  - Pro purchase is handled with RevenueCat and Apple in-app purchase.
  - No demo account is needed because the app has no login.
- Copy App Store metadata and review notes from `docs/app-store-submission.md`.
- Confirm production EAS env includes `EXPO_PUBLIC_REVENUECAT_API_KEY` or
  `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` before every TestFlight build.

## In-App Requirements

- The Pro screen must show the selected plan price and period before purchase.
- The Pro screen must show auto-renewal disclosure before purchase.
- The Pro screen must link to Terms and Privacy Policy before purchase.
- Restore Purchases must remain available.
- Manage subscription must remain available for subscribed users.

## Native Build Requirements

- `app.json` must include `ios.config.usesNonExemptEncryption: false` unless
  non-exempt encryption is added.
- `app.json` must include `ios.privacyManifests`.
- Run `npx expo config --type public` and confirm the iOS privacy manifest is
  present.
- Run `npx expo install --fix` before release builds when Expo SDK packages
  change.
- Upload to TestFlight before release and resolve every App Store Connect email,
  especially ITMS-91053 privacy manifest warnings.

## Product Review Risks

- Do not claim cloud sync, account backup, or end-to-end encryption until those
  features exist.
- If account creation or third-party sign-in is added later, add in-app account
  deletion and Sign in with Apple where required.
- If analytics, ads, attribution, crash reporting, or push-token collection is
  added later, update the privacy policy, App Privacy answers, and manifests.
