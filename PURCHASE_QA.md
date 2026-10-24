# Purchase QA checklist

Manual QA for RevenueCat / Do! Pro in Do! (clearday).

Automated coverage for the store/service layer lives in `npm run test:unit`
(`pro:`, `cache:` and `offerings:` cases). This checklist covers what only a
real device against a real store can prove.

## Prerequisites

- [ ] `.env` has valid RevenueCat API key
- [ ] EAS development or production build installed (not Expo Go for real IAP)
- [ ] RevenueCat `default` offering is **current** with monthly / yearly packages
- [ ] Store products active; sandbox / license tester account ready

## Offerings & UI

- [ ] App launches without crash when RevenueCat configure runs
- [ ] Pro screen opens from Settings / More / locked feature
- [ ] Loading state shows while offerings fetch
- [ ] Price strings from RevenueCat appear on plan cards
- [ ] Subscription disclosure shows **live** store prices when offerings loaded
- [ ] Disclosure still renders static prices when offerings fail (required by review)
- [ ] Empty / failed offerings show an explanatory message + a recovery button
- [ ] No plan cards are shown when offerings are unavailable (nothing fake-purchasable)
- [ ] **Restore Purchases** button visible
- [ ] Pro users see **Manage subscription** (Customer Center)

## Purchases

- [ ] **Monthly** purchase completes; Pro active badge shows
- [ ] **Yearly** purchase completes
- [ ] Cancelled purchase dismisses without crash, and shows **no** error
- [ ] Failed purchase (airplane mode) shows the offline message + **Try again**
- [ ] Ask to Buy / deferred purchase shows the "awaiting approval" message, not a failure
- [ ] Re-purchasing an owned subscription offers **Restore Purchases**, not Retry
- [ ] Purchase that returns no entitlement shows the "went through but not unlocked" message

## Restore

- [ ] Restore with prior purchase → "Pro restored."
- [ ] Restore with no purchase → "No previous Pro purchase was found."
- [ ] Restore offline → "No internet connection. Try restoring again when you are online."
- [ ] Restore button shows "Restoring…" and is disabled while in flight
- [ ] Restore works without app login (store account only)

## Recovery paths

- [ ] Each error message's button matches the failure (Retry plans / Try again / Restore)
- [ ] Errors that cannot be fixed in-app (missing key, unsupported platform) show no button
- [ ] Paywall opened offline → reconnect → foreground app → plans load automatically
- [ ] Customer Center dismissal does **not** also open the App Store subscriptions page

## Entitlement & gates

- [ ] `Do! Simple Ad-Free To Do List Pro` entitlement unlocks Pro in app
- [ ] Second custom list blocked when free; allowed when Pro
- [ ] Recurring tasks gated when free; allowed when Pro
- [ ] Premium themes gated when free
- [ ] Expired subscription (sandbox) locks Pro gates again after refresh
- [ ] Billing issue (sandbox) shows the billing warning but keeps Pro unlocked
- [ ] Cancelled-but-active subscription shows the "stays active until…" notice

## Persistence

- [ ] Force-quit and reopen — Pro status restored from RevenueCat
- [ ] **Launch offline as a Pro user** — Pro gates stay unlocked (cached entitlement)
- [ ] Immediately after a cold launch, a Pro user can pick a premium theme,
      create a 2nd custom list, and quick-add "water plants weekly" as recurring
- [ ] Expired cached entitlement does **not** keep Pro unlocked offline
- [ ] Backup export file contains no `proEntitlementCache` key
- [ ] Restoring a backup does not drop Pro status
- [ ] App foreground refresh updates Pro status

## Privacy & scope

- [ ] No task content sent to RevenueCat (only purchase / entitlement checks)
- [ ] No login / backend for purchases
- [ ] No analytics / tracking SDK added

## Production build

- [ ] Production API keys used (not test key)
- [ ] iOS `buildNumber` / Android `versionCode` increment on release
- [ ] Dev-only RevenueCat logging and entitlement-mismatch warnings absent in release
