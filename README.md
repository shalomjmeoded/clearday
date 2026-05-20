# ClearDay

A minimalist, calm, local-first to-do app for iOS and Android.

## Run

```bash
npm install
npx expo start
```

Press `i` for iOS simulator or `a` for Android emulator. Use Expo Go on a physical device by scanning the QR code.

## Data & storage (MVP)

- **Local SQLite** — `clearday.db` on device; source of truth for tasks, lists, reminders, settings
- **No account, no backend, no cloud sync** — works fully offline
- **First launch** — creates tables, seeds Inbox + default settings, then loads UI (no empty flash on Today)
- **Pro (mock)** — `settings.isPro` in SQLite; toggle on Pro screen for testing
- **Backup** — Export / Import `.clearday` JSON files (Settings → Backup & Restore); manual transfer between devices
- **Phase 2 (planned)** — RevenueCat subscriptions, automatic cloud sync

Tables: `tasks`, `lists`, `reminders`, `settings`

Default settings: system theme, haptics on, completed tasks collapsed, reminder 09:00, `isPro` false.

## Stack

- Expo SDK 54 + React Native
- Expo Router
- SQLite (`expo-sqlite`)
- Zustand
- Expo Notifications, Haptics, Keep Awake, Reanimated, Gesture Handler
- react-native-keyboard-controller
- date-fns

## Layout components (`src/components/layout`)

| Component | Use for |
|-----------|---------|
| `Screen` | Base shell (`variant="tab"` or `"stack"`) |
| `ScrollScreen` | Tab screens with scroll + inputs (Lists, More) |
| `ScreenWithBottomBar` | Today + list detail (sticky add bar) |
| `FormScreen` | Modals with forms (task detail, settings, pro) |
| `BottomInputBar` | Keyboard-sticky add field |
| `useScreenInsets` | Shared inset math (notch, tab bar, home indicator) |

## Free vs Pro (mock)

**Free:** Today, schedule, focus, basic reminders, inbox + one custom list, themes, local SQLite storage, done history, subtle mock ads (Today, Schedule, Lists only).

**Pro (mock):** Today — no ads, unlimited lists, calendar due-date picker on tasks. Paywall lists other benefits under **Coming soon** (not built yet).

Open **More → ClearDay Pro** → **Mock Pro enabled** (persists in SQLite).

**Restore purchases** shows a placeholder until RevenueCat is integrated.

## Ads (free users only)

- Native-style mock cards, max one per screen
- No ads in task detail, settings, Pro, Focus, or while typing
- Hidden when `isPro` is true

## Subscriptions (future)

`src/features/pro/subscriptionService.ts` defines `SubscriptionProvider` for swapping mock → RevenueCat later.

## Backup (future)

Types in `src/types/backup.ts` — export/import UI in Settings marked Coming soon.

## Privacy copy

Shared strings in `src/constants/privacyCopy.ts`. Store listing draft: `docs/app-store-listing.md`.

Main line: *Your tasks stay on your phone. We do not upload, read, sell, or share your task data.*
