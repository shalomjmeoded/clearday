# Accessibility

Target: WCAG 2.2 AA where it applies to native, plus Apple HIG (44pt targets,
Dynamic Type, Reduce Motion) and TalkBack expectations on Android.

The app runs the New Architecture (`newArchEnabled: true` in `app.json`), so the
Fabric code paths are the ones that matter — some of the legacy `RCTView.m`
accessibility behaviour is explicitly marked "does not run on Fabric".

## Conventions

**Pair the role with the right state.** These are not interchangeable; the wrong
pairing silently announces nothing on one of the two platforms.

| Role | State to set | iOS (Fabric) | Android |
|---|---|---|---|
| `radio` | `checked` | synthesises "radio button" + "checked"/"unchecked" into `accessibilityValue` | `RadioButton` class, `setCheckable`/`setChecked` |
| `checkbox` | `checked` | synthesises "checkbox" + checked state | `CheckBox` class, `setCheckable`/`setChecked` |
| `togglebutton` | `checked` | `UIAccessibilityTraitButton` + checked state | `setClickable` + `setCheckable` |
| `tab` | `selected` | no trait of its own; `selected` → `UIAccessibilityTraitSelected` | plain `View` class; `setSelected` |
| `button` | `selected` for grid/date selection | `UIAccessibilityTraitSelected` | `setClickable` + `setSelected` |

`selected` on a `radio` is the common trap: it reads correctly on iOS and is
unreliable on Android, because TalkBack takes a RadioButton's state from
`isChecked`.

**Compose labels that carry the whole row.** Once a container is `accessible`
(any `Pressable` with a press handler is), its children collapse into one
element and only the label is spoken. Anything visible but absent from the label
is invisible to a screen reader. See `buildRowProps`/`accessibilityLabel` in
`src/components/tasks/TaskRow.tsx` and `describe()` in
`src/components/lists/ListRow.tsx`.

**Set an explicit label whenever an icon sits next to text** inside one
accessible element. Ionicons glyphs are private-use Unicode characters; left to
the label derived from children they leak in as unreadable junk.

**Hide decorative subtrees** with both `accessibilityElementsHidden` (iOS) and
`importantForAccessibility="no-hide-descendants"` (Android). `TaskRow` exports a
`DECORATIVE` constant for this.

**Gesture-only actions need an `accessibilityActions` equivalent.** Swipe rails,
long-press drag, and double-tap are all unreachable with a screen reader.

**A `Pressable` that wraps structure needs `accessible={false}`.** `Pressable`
defaults to `accessible={true}`, which on iOS sets `isAccessibilityElement` and
*collapses every descendant into one element*. On a container — a sheet whose
only job is to swallow backdrop taps — that makes everything inside it
unreachable. `KeyboardDismissView` has always done this correctly; the bottom
sheets did not.

**Touch targets: 44pt, and keep `hitSlop` <= gap/2.** `hitSlop` is the right
tool when growing an element would shift layout, but slop larger than half the
gap makes neighbouring hit rects *overlap*, and the later sibling wins touch
dispatch — so taps near the boundary silently go to the wrong control. The same
applies across parent boundaries: a child's slop that reaches into a later
interactive sibling is simply ignored.

**Reduce Motion needs no code.** Reanimated 4 defaults both `withTiming`/
`withSpring` (`getReduceMotionFromConfig`) and layout animations
(`BaseAnimationBuilder.reduceMotionV`) to `ReduceMotion.System`, so every
animation in the app already honours the OS setting. Only override it with
`ReduceMotion.Never` if an animation is load-bearing.

## Done

- **`TaskRow`** — `accessibilityActions` for complete/restore, star, repeat,
  archive, delete, and move up/down, mirroring the swipe rails and the drag
  handle. Composed label (status, due date, reminder, repeat, list, priority).
  `onAccessibilityTap` routes assistive activation straight to the detail screen,
  bypassing the 260 ms double-tap timer that VoiceOver cannot drive. Decorative
  date column and pin marker hidden.
- **`TaskList`** — `moveTaskBy` backs the move actions; offered only where the
  move is possible. Same `onReorder` contract as `handleDragEnd`.
- **`TaskCheckbox`** — now requires an `accessibilityLabel`; `checkbox` role and
  `checked` state.
- **Quick-add toolbar** (`BottomInputBar.ToolbarBtn`) — `a11yLabel` is now
  required, `togglebutton` role, `checked` state. Labels carry the current value
  ("Reminder: 9:00 AM", "Repeats daily", "Color: Red").
- **Selection state** across `SegmentedControl`, `SettingsChips`, Today status
  tabs and sort menu, task-detail priority/colour/list/repeat, calendar day
  cells, `TaskColorPicker`, `ReminderTimePicker` columns, and the `pro.tsx` plan
  radios (corrected from `selected` to `checked`).
- **Calendar day cells** — full date labels ("Monday, October 27, today")
  instead of a bare number; weekday header row hidden.
- **Time wheel cells** — units in the label ("9 hours", "30 minutes") so the two
  columns are distinguishable.
- `accessibilityRole="button"` added to `SettingsRow`, the Today sort pill, and
  the task-detail schedule/reminder/back controls.
- **Bottom sheets were one opaque element on iOS.** All six
  (`CalendarDatePicker`, `QuickTimePicker`, `TaskColorPicker`,
  `ReminderTimePicker`, `RecurrencePicker`, `ScheduleDatePicker`) wrapped their
  contents in an `accessible` backdrop and sheet `Pressable`, collapsing the
  day grid, time wheel, swatches and preset rows into a single unreadable
  element. Both now set `accessible={false}`, and the sheet handles
  `onAccessibilityEscape`.
- **Announcements** — a shared `src/utils/accessibility.ts` provides `announce`,
  `useAnnounceOnChange`, `useScreenReaderEnabled`, `useAccessibleTimeout` and
  the `DECORATIVE` spread. Wired into the Toast, the quick-add empty hint, the
  Focus pick count, and `TextField` errors.
- **Toast** — announced on appear, and its auto-dismiss now honours Android's
  "Time to take action" plus a 15s floor when a screen reader is running and
  the toast has an action. `accessibilityRole="text"` on the dismiss pressable
  corrected to `button`.
- **Headings** — `ScreenHeader`, `SettingsGroup`, Today's hero, the six
  task-detail section labels, every sheet title, and both Focus titles.
- **`TextField`** — the caption and error now ride on the input as its
  accessible name (the native equivalent of `<label for>`) and drop out of the
  tree as duplicates; errors are announced when they appear.
- **`PrimaryButton`** — `button` role, label and disabled state, so Mark done /
  Archive / Delete permanently announce correctly.
- **Settings "Haptics"** — now a `switch` with `checked`, via a new `toggle`
  prop on `SettingsRow`.
- **Contrast** — see below; enforced by a test.
- `RecurrencePicker` — an eleventh selection group missed in the first sweep.
- **Touch targets** — all seven undersized controls now reach 44x44, by growing
  the element where that was contained and using `hitSlop` where it was not:

  | Control | Before | After | Cost |
  |---|---|---|---|
  | task detail swatches | 36 | 36 + 4 slop | none |
  | `TaskColorPicker` swatches | 32 | 36 + 4 slop | dots 4pt wider, same grid reflow |
  | Today sort pill | 32 | 36 + 4 slop | none — row height already set by the icon buttons |
  | Today sort menu rows | 34h | 44h | menu 60pt taller when open |
  | Today status tabs | 38h | 44h | strip 6pt taller |
  | `CalendarDatePicker` cells | 38h | 44h | sheet 36pt taller |
  | quick-add `toolBtn` | 34x38, slop 4 | 40x40, slop 2 | toolbar 6pt taller |

  The `toolBtn` change also removed a real defect: slop of 4 against a 4pt gap
  made adjacent hit rects overlap, handing taps in the gap to whichever button
  came later in the row.

## Contrast

Enforced by `theme: every palette meets WCAG AA contrast on the pairs it
renders` in `test-harness/run-unit-tests.ts`, against the pair list in
`src/theme/contrast.ts`.

That list is deliberately *not* the cartesian product of every text colour and
every surface. `accent` on `sectionBg`, for instance, never renders: a chip that
turns accent-coloured also swaps its background to `accent`/`accentSoft`.
Checking pairs that never appear would have forced the brand colour darker to
satisfy a combination no user ever sees. Add a pair when a new combination
starts rendering.

Two things worth knowing when adjusting tokens:

- The binding surface is usually `sectionBg`, not `background` — it is the
  darkest surface in every light palette. Each light palette overrides it, so
  `mutedText` needs a per-palette value rather than one shared one.
- The swipe rails are backgrounds for a 10px/700 label, so they take the
  small-text 4.5:1 threshold, not the 3:1 that larger text would allow.

### Still open: non-text contrast (WCAG 1.4.11)

Not fixed, and deliberately left for a design decision rather than settled in
code. `border` is 1.18:1 and `paperLine` 1.23:1 against the light background,
at `hairlineWidth`.

The compliance case is split:

- **Probably out of scope** — row separators and the paper ruling are
  decorative. Each task row is identified by its text, not its divider.
- **Probably in scope** — the border is the only thing marking an *unselected*
  chip or an unfocused input as a control. 1.4.11 covers "visual information
  required to identify user interface components and states".

Raising `border` to 3:1 globally would hit every separator and visibly change
the paper-like look. The narrower fix is a second token (`borderStrong`) used
only where a border carries component identity — `TextField`, the chips, the
toolbar buttons — leaving the decorative ruling alone. That is still a visual
change and wants a designer's eye.

## Remaining, in suggested order

### 1. Dynamic Type
Scaling is enabled (nothing sets `allowFontScaling={false}` — keep it that way),
but every size is a fixed number paired with a fixed `lineHeight` inside
fixed-height containers:

- tab bar height derives from a 56pt constant with an 11pt label
  (`app/(tabs)/_layout.tsx` + `src/constants/layout.ts`)
- `TaskRow` date column `width: 34` with `numberOfLines={1}`; note preview
  `numberOfLines={1}`
- `Toast` `maxWidth: '78%'` + `numberOfLines={1}` — the undo message truncates
- `ReminderTimePicker` is driven by `ROW_HEIGHT = 44` scroll math with a
  hardcoded `fadeTop: { top: 28 }`; scaled text overflows cells *and* desyncs
  the snap offsets
- `CalendarDatePicker` has no `ScrollView`, so a six-week month at a large text
  size can overflow a short device and be clipped (the sheet is bottom
  anchored). Raising the day cells to 44pt made the sheet ~36pt taller, which
  narrows that margin — worth a `maxHeight` plus scroll when this is tackled.

Test at the largest standard size and at AX3. This is the largest remaining
item and the one most likely to need real layout rework.

### 2. Non-text contrast
See above — needs a design call on `borderStrong`.

### 3. Nice to have
- The `TaskRow` star button is effectively **34x44, not 44x44**. It is 24pt
  wide with `hitSlop={10}`, but it sits in a 28pt `pinColumn` that precedes the
  main `content` Pressable, so the slop reaching right is swallowed by that
  later sibling. Fixing it means widening `pinColumn`, which shifts content
  right on every task row — a visible change to the densest screen, for a
  control already reachable via the swipe rail, the row's "Star task"
  accessibility action, and task detail.
- `ReminderTimePicker` as `accessibilityRole="adjustable"` with
  `accessibilityValue` + increment/decrement, collapsing 24 + 60 focus stops
  to 2. The per-cell `radio` roles are a workable stopgap, not the end state.
- `accessibilityHint` for the remaining non-obvious gestures: long-press on
  `ListRow`, double-tap-to-complete on `TaskRow`.
- Focus management for the Today sort menu and search bar, which mount and
  unmount with no announcement.
- "Saving…" in `app/task/[id].tsx` is still silent. Left alone on purpose —
  it toggles on every keystroke-driven save and announcing it would be noise.
  If it is wanted, debounce it rather than announcing the raw state.
- The parsed-input echo in `BottomInputBar` ("Tomorrow · 10:00 · Starred") is
  also silent, for the same reason: it changes on every keystroke. It is
  reachable by swiping to it.
- `src/components/tasks/ScheduleDatePicker.tsx` is not imported anywhere. It
  has been given the same sheet fixes so it is not a trap, but it is dead code
  and a candidate for deletion.
- `React.memo` on `TaskRow` is currently a no-op: `buildRowProps` returns fresh
  closures each render, so every row re-renders whenever the list does. Not an
  accessibility issue, but it sits in the same file.

## Checking work

```
npx tsc --noEmit
npm test                                                   # 194 unit + 34 backup
npx expo export --platform ios --output-dir /tmp/check      # catches bundle-time errors
npx expo export --platform android --output-dir /tmp/check
```

Four accessibility behaviours are covered by tests in
`test-harness/run-unit-tests.ts`:

- `describeTaskRow` / `taskReminderDisplay` (`src/utils/taskAccessibility.ts`) —
  that a row speaks its completed state, due date, snoozed reminder, cadence,
  list and priority, and that a completed row drops the detail it also hides
  visually.
- `moveByOneSlot` (`src/utils/reorder.ts`) — the reorder behind the Move
  up/Move down actions, including refusing impossible moves and never mutating
  its input.
- `resolveAccessibleTimeout` (`src/utils/accessibility.ts`) — that a transient
  message's timeout is never shortened by a lagging async value.
- `findContrastFailures` (`src/theme/contrast.ts`) — every palette against the
  pairs it actually renders.

These exist because the logic was deliberately pulled out of the components:
there is **no component-level test infrastructure**, so the rendered
accessibility tree cannot be asserted. `react-test-renderer` sits unused in
`devDependencies`; wiring it up (it needs native-module mocks for Reanimated and
gesture-handler) is the single biggest thing that would make this area testable.

Everything else needs a device with VoiceOver or TalkBack on. Xcode's
Accessibility Inspector audit catches unlabeled controls and small targets
quickly.

### Not verified on a device

- `onAccessibilityEscape` on the bottom sheets. UIKit should walk up from the
  focused element to the sheet view, but the sheet is deliberately
  `accessible={false}`, so this needs confirming. Every sheet still has a
  Cancel button as the primary path.
- Whether the composed labels read naturally rather than merely completely.
  `. ` separators were chosen for VoiceOver's phrasing; that is a judgement
  call best checked by ear.
