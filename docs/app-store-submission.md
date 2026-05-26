# Do! iOS App Store Submission Pack

Use this as the source of truth when filling App Store Connect.

## App Information

- App name: Do!
- Bundle ID: `com.do.simpletodo`
- SKU: `do-private-todo-ios`
- Primary language: English (U.S.)
- Category: Productivity
- Subtitle: Minimalist, private Todo list app
- Privacy policy URL: `https://shalomjmeoded.github.io/clearday/privacy.html`
- Support URL: `https://shalomjmeoded.github.io/clearday/privacy.html`

## Description

Do! helps you focus on today without clutter. Add tasks, schedule what matters,
organize lists, and use Focus Mode when you need a simple list in front of you.

Simple by design. Private on your phone. No ads.

Your tasks stay on your phone. We do not upload, read, sell, or share your task
data.

Free features include today planning, task lists, scheduling, reminders, Focus
Mode, local backup export/import, finished tasks, light/dark/system theme, and
private on-device task storage.

Do! Pro unlocks premium features including unlimited custom lists and recurring
tasks.

Backup export/import is available for manual device transfer. Cloud sync is not
available.

## Keywords

todo,tasks,minimalist,private,local,offline,no ads,simple,focus,list

## Promotional Text

A calm, private to-do app where your tasks stay on your phone.

## Review Notes

Do! does not require login, so no demo account is needed.

Core task, list, reminder, focus, and backup features are usable without an
account. Task data is stored locally on the device. Pro subscriptions are handled
through Apple in-app purchase via RevenueCat.

To test subscriptions:

1. Open the app.
2. Go to More.
3. Tap Do! Pro.
4. Choose Monthly or Yearly.
5. Tap Continue with selected plan.

Restore Purchases is available on the Pro screen. For subscribed users, Manage
subscription opens RevenueCat Customer Center when available, otherwise Apple
subscription management.

## In-App Purchase Products

Create one subscription group for Do! Pro.

- Monthly product ID: `com.do.simpletodo.pro.monthly`
- Yearly product ID: `com.do.simpletodo.pro.yearly`
- RevenueCat entitlement ID: `Do! Simple Ad-Free To Do List Pro`
- RevenueCat offering ID: `default`

Suggested display names:

- Do! Pro Monthly
- Do! Pro Yearly

## App Privacy Answers

- Tracking: No.
- Data linked to the user: Purchases, if App Store Connect requires RevenueCat
  purchase/subscription data to be marked as linked.
- Data used for tracking: None.
- Task content: Not collected by the developer.
- Contacts, location, photos, health, financial, diagnostics, advertising data:
  Not collected unless a future SDK or feature is added.

## TestFlight Checklist

- Fresh install opens without crashing.
- Create, edit, complete, and delete a task.
- Create a custom list.
- Schedule a reminder and confirm permission copy is clear.
- Export and import a backup.
- Open Do! Pro and confirm monthly/yearly prices load.
- Purchase monthly with a sandbox tester.
- Confirm Monthly remains highlighted after purchase and relaunch.
- Restore purchases.
- Tap Manage subscription.
- Repeat purchase flow for yearly or subscription change path if available.
