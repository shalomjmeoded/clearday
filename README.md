# Do!

Minimalist, private Todo list app for iOS and Android.

**Your tasks stay on your phone. We do not upload, read, sell, or share your task data.**

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
- **Pro** — RevenueCat-backed subscriptions unlock Pro features
- **Backup** — Export / Import `.clearday` JSON files (Settings → Backup & Restore); manual transfer between devices
- **Phase 2 (planned)** — automatic cloud sync

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

## Free vs Pro

**Free:** Today, All, Tomorrow/Later, focus, basic reminders, inbox + one custom list, themes, local storage, finished tasks, 0 ads.

**Pro:** Unlimited custom lists, recurring tasks, and Pro-gated features. Purchases, restore, and subscription status are handled with RevenueCat.

## Privacy copy

Shared strings in `src/constants/privacyCopy.ts`. Store listing draft:
`docs/app-store-listing.md`. iOS submission metadata:
`docs/app-store-submission.md`. Public privacy policy source:
`docs/privacy.html`.

Main line: *Your tasks stay on your phone. We do not upload, read, sell, or share your task data.*

## Brand assets

Expo icons and splash live in `assets/images/`. Source SVGs in `assets/svg/`.

Light splash background: `#F6F1E8`. Dark splash background: `#111820`.
