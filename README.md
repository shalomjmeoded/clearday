# Do!

Minimalist, private todo list app for iOS and Android, for people who want to organize tasks and reminders without an account. The product is called **Do!**; the repository, npm package, database, and backup format retain the original **clearday** name.

**Your tasks stay on your phone. We do not upload, read, sell, or share your task data.**

## Local development

Use the Node.js version in `.nvmrc` and npm. With nvm installed, run `nvm install` and `nvm use` first.

For native development, install Xcode and an iOS simulator on macOS, or Android Studio and an Android emulator. The commands below build a development client locally; no EAS account is needed for this path.

```bash
npm ci
cp .env.example .env
npm run ios
# Or, with an Android emulator running:
npm run android
```

After the first native build, start Metro for the installed development client:

```bash
npx expo start --dev-client
```

Press `i` or `a` to open the installed client. Rebuild it after changing native dependencies or native app configuration. Use a development build for the full app; Expo Go does not support real in-app purchases and has native-module limitations.

### Purchases are optional for core development

Leave the example RevenueCat key blank to work on free task features. With no key configured, the subscription service reports Free status and the Pro screen reports that subscriptions are unconfigured. Purchasing, restoring purchases, and unlocking Pro require your own RevenueCat/store configuration and a native build. See [RevenueCat setup](REVENUECAT_SETUP.md) and [purchase QA](PURCHASE_QA.md).

Only RevenueCat **public SDK keys** belong in `EXPO_PUBLIC_*` variables; these values are included in the app bundle. Keep private service credentials out of the repository and client configuration.

The tracked app config points to the existing Do! bundle IDs and EAS project. For your own distribution, configure your own identifiers and EAS project before using cloud build or submission commands.

### Checks

```bash
npm run typecheck
npm run check:release
```

`typecheck` runs TypeScript without emitting files. `check:release` also checks Expo dependency compatibility and resolves the public app config. GitHub Actions runs a clean npm install, TypeScript check, and Gitleaks scan of Git history on pushes and pull requests; it does not build the native app or validate purchases.

With [Gitleaks](https://github.com/gitleaks/gitleaks) installed, repeat the history scan locally with:

```bash
gitleaks git --redact --log-opts=--all .
```

This scans committed history across available refs. Review new and uncommitted files before committing; `.gitignore` does not remove files that were already tracked. If a secret was committed, revoke it and coordinate history cleanup before sharing the repository.

### Manual smoke check

Use made-up task content on a simulator or test device:

1. Create, edit, complete, and reopen a task; restart the app and check persistence.
2. Create a custom list, move a task into it, and verify Today and scheduled views.
3. Grant notification permission and schedule a reminder; check delivery on a device.
4. Export a backup, then import it on a disposable test installation and verify tasks and settings. Import replaces existing local data.
5. With RevenueCat left blank, verify the free flows still work and Pro explains that purchases are unconfigured.

## Planned work

See [the roadmap draft](ROADMAP.md) for proposed reliability work and acceptance criteria. Priorities and estimates need maintainer confirmation.

## License and submission

Original project code is licensed under the [MIT License](LICENSE). Third-party dependencies and bundled assets retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).

See the [project submission checklist](docs/project-submission.md) for repository details, a description draft, and the ownership and eligibility confirmations still needed before submitting.

## Data & storage (MVP)

- **Local SQLite** — `clearday.db` on device; source of truth for tasks, lists, reminders, settings
- **No account, no task backend, no cloud sync** — core task management works offline; subscriptions use RevenueCat and the app stores
- **First launch** — creates tables, seeds Inbox + default settings, then loads UI (no empty flash on Today)
- **Pro** — RevenueCat-backed subscriptions unlock Pro features
- **Backup** — Export / Import `.clearday` JSON files (Settings → Backup & Restore); manual transfer between devices
- **Device transfer** — manual backup transfer; automatic cloud sync is not implemented

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
