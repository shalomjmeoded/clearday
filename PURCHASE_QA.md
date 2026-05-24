# Purchase QA checklist

Manual QA for RevenueCat / Do! Pro in Do! (clearday).

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
- [ ] Empty offerings show fallback copy + **Retry**
- [ ] **Restore Purchases** button visible
- [ ] **View all plans** opens RevenueCat paywall
- [ ] Pro users see **Manage subscription** (Customer Center)

## Purchases

- [ ] **Monthly** purchase completes; Pro active badge shows
- [ ] **Yearly** purchase completes
- [ ] Cancelled purchase dismisses without crash or error spam
- [ ] Failed purchase (airplane mode) shows network / error message
- [ ] Paywall purchase updates Pro state

## Restore

- [ ] Restore with prior purchase → “Pro restored.”
- [ ] Restore with no purchase → “No previous Pro purchase was found.”
- [ ] Restore offline → “Could not restore purchases. Try again.”
- [ ] Restore works without app login (store account only)

## Entitlement & gates

- [ ] `Do! Simple Ad-Free To Do List Pro` entitlement unlocks Pro in app
- [ ] Second custom list blocked when free; allowed when Pro
- [ ] Recurring tasks gated when free; allowed when Pro
- [ ] Premium themes gated when free
- [ ] Expired subscription (sandbox) locks Pro gates again after refresh

## Persistence

- [ ] Force-quit and reopen — Pro status restored from RevenueCat
- [ ] App foreground refresh updates Pro status

## Privacy & scope

- [ ] No task content sent to RevenueCat (only purchase / entitlement checks)
- [ ] No login / backend for purchases
- [ ] No analytics / tracking SDK added
- [ ] Mock Pro toggle visible only in `__DEV__` builds

## Production build

- [ ] `__DEV__` mock Pro hidden in release build
- [ ] Production API keys used (not test key)
- [ ] iOS `buildNumber` / Android `versionCode` increment on release
