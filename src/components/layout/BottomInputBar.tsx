import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import Animated, { FadeInDown, FadeInUp, FadeOut, FadeOutDown } from 'react-native-reanimated';

import { CalendarDatePicker } from '@/components/tasks/CalendarDatePicker';
import { QuickTimePicker } from '@/components/tasks/QuickTimePicker';
import { RecurrencePicker } from '@/components/tasks/RecurrencePicker';
import { TaskColorPicker } from '@/components/tasks/TaskColorPicker';
import { MIN_TOUCH_TARGET } from '@/constants/layout';
import {
  areLocalNotificationsSupported,
  requestReminderPermission,
} from '@/features/reminders/reminderService';
import { elevation } from '@/theme/elevation';
import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';
import { useListStore } from '@/store/listStore';
import { useProStore } from '@/store/proStore';
import type { QuickAddOptions } from '@/types/quickAdd';
import { DEFAULT_RECURRENCE, type TaskRecurrence } from '@/types/recurrence';
import { formatRecurrenceLabel, isRecurring } from '@/utils/recurrence';
import { formatDisplayDate, formatTime, isToday, todayDueIso } from '@/utils/dates';
import { tomorrowIso } from '@/utils/scheduleDates';
import { parseTaskInput } from '@/utils/parseTaskInput';
import { router } from 'expo-router';
import { triggerLightHaptic, triggerSelectionHaptic } from '@/utils/haptics';

import { useScreenInsets } from './useScreenInsets';

interface Props {
  onSubmit: (text: string, options?: QuickAddOptions) => void;
  placeholder?: string;
  /** Lift above the tab bar on tab screens (keyboard closed). */
  aboveTabBar?: boolean;
  inputRef?: React.RefObject<TextInput | null>;
  /** Parent-controlled add mode — keeps toolbar/input active after picker actions. */
  keepEditing?: boolean;
  active?: boolean;
  inactiveContent?: React.ReactNode;
  /** Called after dismissing an empty, option-free draft. */
  onDismissEmpty?: () => void;
  concealed?: boolean;
}

type DatePick = 'today' | 'tomorrow' | 'pick';

/** Sticks above the keyboard; safe-area padding when keyboard is closed. */
export function BottomInputBar({
  onSubmit,
  placeholder = 'Add something…',
  aboveTabBar = false,
  inputRef,
  keepEditing = false,
  active = true,
  inactiveContent,
  onDismissEmpty,
  concealed = false,
}: Props) {
  const { tokens } = useTheme();
  const { bottomSafe, tabBarHeight } = useScreenInsets({
    variant: aboveTabBar ? 'tab' : 'stack',
  });
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [emptyHint, setEmptyHint] = useState(false);
  const [draftDatePick, setDraftDatePick] = useState<DatePick | null>(null);
  const [draftDueDate, setDraftDueDate] = useState<string | undefined>();
  const [draftReminderAt, setDraftReminderAt] = useState<string | undefined>();
  const [draftColor, setDraftColor] = useState<string | null | undefined>();
  const [draftPinned, setDraftPinned] = useState(false);
  const [draftRecurrence, setDraftRecurrence] =
    useState<TaskRecurrence>(DEFAULT_RECURRENCE);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [showColor, setShowColor] = useState(false);
  const [showRecurrence, setShowRecurrence] = useState(false);
  const isPro = useProStore((s) => s.isPro);
  const lists = useListStore((s) => s.lists);
  const localInputRef = useRef<TextInput>(null);
  const pickerOpenRef = useRef(false);
  const suppressBlurRef = useRef(false);
  const submitDismissRef = useRef(false);
  const draftActiveRef = useRef(false);

  const pickerOpen = showCalendar || showTime || showColor || showRecurrence;
  pickerOpenRef.current = pickerOpen;

  draftActiveRef.current =
    draftDatePick != null ||
    draftReminderAt != null ||
    draftColor != null ||
    draftPinned ||
    isRecurring(draftRecurrence) ||
    Boolean(text.trim());

  // Echo back what the typed text will turn into ("tomorrow 10am"), leaving
  // out anything the toolbar has already pinned down, since that wins.
  const parsedHint = useMemo(() => {
    const trimmed = text.trim();
    if (!trimmed) return '';
    try {
      const parsed = parseTaskInput(trimmed, {
        allowRecurrence: isPro,
        knownListNames: lists.map((l) => l.name),
      });
      const parts: string[] = [];
      if (parsed.dueDate && !draftDueDate) parts.push(formatDisplayDate(parsed.dueDate));
      if (parsed.reminderAt && !draftReminderAt) parts.push(formatTime(parsed.reminderAt));
      if (parsed.recurrence && isRecurring(parsed.recurrence) && !isRecurring(draftRecurrence)) {
        parts.push(formatRecurrenceLabel(parsed.recurrence));
      }
      // On another day the pin yields to the date at save time, so the hint
      // only promises a pin when the task will actually land on today.
      const effectiveDue = draftDueDate ?? parsed.dueDate;
      if (
        parsed.priority === 'must_do_today' &&
        !draftPinned &&
        (!effectiveDue || isToday(effectiveDue))
      ) {
        parts.push('Pinned to today');
      } else if (parsed.priority === 'important') parts.push('Starred');
      if (parsed.listHint) parts.push(`List: ${parsed.listHint}`);
      return parts.join(' · ');
    } catch {
      return '';
    }
  }, [text, isPro, lists, draftDueDate, draftReminderAt, draftRecurrence, draftPinned]);

  const hasDraftContent =
    Boolean(text.trim()) ||
    draftDatePick != null ||
    draftReminderAt != null ||
    draftColor != null ||
    draftPinned ||
    isRecurring(draftRecurrence);

  const focusInput = useCallback(() => {
    setTimeout(() => {
      (inputRef?.current ?? localInputRef.current)?.focus();
      setFocused(true);
      suppressBlurRef.current = false;
    }, 60);
  }, [inputRef]);

  const beginToolbarAction = useCallback(() => {
    suppressBlurRef.current = true;
    setFocused(true);
  }, []);

  const dismissInput = useCallback((notifyEmpty = true) => {
    const shouldDismissEmpty = notifyEmpty && !draftActiveRef.current;
    submitDismissRef.current = true;
    suppressBlurRef.current = false;
    setFocused(false);
    (inputRef?.current ?? localInputRef.current)?.blur();
    Keyboard.dismiss();
    if (shouldDismissEmpty) onDismissEmpty?.();
  }, [inputRef, onDismissEmpty]);

  const closeCalendar = useCallback(() => {
    pickerOpenRef.current = false;
    setShowCalendar(false);
    focusInput();
  }, [focusInput]);

  const closeTime = useCallback(() => {
    pickerOpenRef.current = false;
    setShowTime(false);
    focusInput();
  }, [focusInput]);

  const closeColor = useCallback(() => {
    pickerOpenRef.current = false;
    setShowColor(false);
    focusInput();
  }, [focusInput]);

  const closeRecurrence = useCallback(() => {
    pickerOpenRef.current = false;
    setShowRecurrence(false);
    focusInput();
  }, [focusInput]);

  const resetDraft = () => {
    setDraftDatePick(null);
    setDraftDueDate(undefined);
    setDraftReminderAt(undefined);
    setDraftColor(undefined);
    setDraftPinned(false);
    setDraftRecurrence(DEFAULT_RECURRENCE);
  };

  const clearDatePick = () => {
    setDraftDatePick(null);
    setDraftDueDate(undefined);
  };

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setEmptyHint(true);
      return;
    }
    setEmptyHint(false);
    await triggerLightHaptic();
    const options: QuickAddOptions = {};
    if (draftDueDate) options.dueDate = draftDueDate;
    if (draftReminderAt) options.reminderAt = draftReminderAt;
    if (draftColor !== undefined) options.color = draftColor;
    if (draftPinned) options.priority = 'must_do_today';
    if (isRecurring(draftRecurrence)) options.recurrence = draftRecurrence;
    onSubmit(trimmed, Object.keys(options).length > 0 ? options : undefined);
    setText('');
    resetDraft();
    draftActiveRef.current = false;
    dismissInput(false);
  };

  const openCalendar = async () => {
    beginToolbarAction();
    await triggerSelectionHaptic();
    pickerOpenRef.current = true;
    setShowCalendar(true);
  };

  const setToday = async () => {
    beginToolbarAction();
    await triggerSelectionHaptic();
    if (draftDatePick === 'today') {
      clearDatePick();
      focusInput();
      return;
    }
    setDraftDatePick('today');
    setDraftDueDate(todayDueIso());
    focusInput();
  };

  const setTomorrow = async () => {
    beginToolbarAction();
    await triggerSelectionHaptic();
    if (draftDatePick === 'tomorrow') {
      clearDatePick();
      focusInput();
      return;
    }
    setDraftDatePick('tomorrow');
    setDraftDueDate(tomorrowIso());
    // The day wins over a pin at save time; mirror that in the draft.
    setDraftPinned(false);
    focusInput();
  };

  const openTime = async () => {
    beginToolbarAction();
    await triggerSelectionHaptic();
    // Ask up front so a denied permission never leaves a reminder that can't ring.
    if (!areLocalNotificationsSupported()) {
      Alert.alert(
        'Reminders',
        'Local reminders need a development build on Android. The task will still save without one.'
      );
      focusInput();
      return;
    }
    const granted = await requestReminderPermission();
    if (!granted) {
      Alert.alert(
        'Notifications off',
        'Reminders need notification permission. You can turn it on in Settings → Reminders.'
      );
      focusInput();
      return;
    }
    pickerOpenRef.current = true;
    setShowTime(true);
  };

  const togglePin = async () => {
    beginToolbarAction();
    await triggerSelectionHaptic();
    // A pin means today; a date on another day would silently win at save
    // time, so pinning clears it rather than leaving both toggles lit.
    if (!draftPinned && draftDueDate && !isToday(draftDueDate)) {
      clearDatePick();
    }
    setDraftPinned(!draftPinned);
    focusInput();
  };

  const openRecurrence = async () => {
    beginToolbarAction();
    await triggerSelectionHaptic();
    if (!isPro) {
      Alert.alert('Do! Pro', 'Repeating tasks are included with Pro.', [
        { text: 'Not now', style: 'cancel', onPress: () => focusInput() },
        { text: 'View Pro', onPress: () => router.push('/pro') },
      ]);
      return;
    }
    pickerOpenRef.current = true;
    setShowRecurrence(true);
  };

  const openColor = async () => {
    beginToolbarAction();
    await triggerSelectionHaptic();
    pickerOpenRef.current = true;
    setShowColor(true);
  };

  const toolbarVisible =
    keepEditing ||
    focused ||
    pickerOpen ||
    hasDraftContent;
  const restoreInputVisible = hasDraftContent && !focused && !pickerOpen;

  const stickyStyle = [
    styles.sticky,
    concealed && styles.concealed,
    {
      backgroundColor: tokens.background,
      borderTopColor: tokens.border,
      paddingBottom: aboveTabBar ? spacing.sm : Math.max(bottomSafe, spacing.sm),
    },
  ];

  if (!active) {
    const inactiveStyle = [
      styles.inactiveSticky,
      {
        bottom: aboveTabBar ? spacing.lg : Math.max(bottomSafe, spacing.sm),
      },
    ];
    return inactiveContent ? <View style={inactiveStyle}>{inactiveContent}</View> : null;
  }

  // When the keyboard opens it covers the tab bar, so the bar travels the
  // extra tab-bar height to land right on top of the keyboard.
  const openedOffset = aboveTabBar ? tabBarHeight + spacing.sm : spacing.sm;

  return (
    <KeyboardStickyView
      offset={{ closed: 0, opened: openedOffset }}
      style={stickyStyle}
    >
      <Animated.View
        entering={FadeInUp.duration(200)}
        exiting={FadeOutDown.duration(150)}
      >
      {toolbarVisible ? (
        <Animated.View
          entering={FadeInDown.duration(160)}
          exiting={FadeOut.duration(120)}
          style={styles.toolbar}
        >
          <ToolbarBtn
            icon="calendar-outline"
            active={draftDatePick === 'pick'}
            onPress={openCalendar}
            tokens={tokens}
          />
          <ToolbarBtn
            label="Today"
            active={draftDatePick === 'today'}
            onPress={setToday}
            tokens={tokens}
          />
          <ToolbarBtn
            label="Tmrw"
            active={draftDatePick === 'tomorrow'}
            onPress={setTomorrow}
            tokens={tokens}
          />
          <ToolbarBtn
            icon="time-outline"
            active={Boolean(draftReminderAt)}
            onPress={openTime}
            tokens={tokens}
          />
          <ToolbarBtn
            icon="pin-outline"
            active={draftPinned}
            onPress={togglePin}
            tokens={tokens}
          />
          <ToolbarBtn
            icon="repeat-outline"
            active={isRecurring(draftRecurrence)}
            onPress={openRecurrence}
            tokens={tokens}
          />
          <ToolbarBtn
            icon="color-palette-outline"
            active={draftColor != null && draftColor !== undefined}
            onPress={openColor}
            tokens={tokens}
            colorDot={draftColor ?? undefined}
          />
        </Animated.View>
      ) : null}
      <View
        style={[
          styles.inputWrap,
          {
            backgroundColor: tokens.inputBg,
            borderColor: focused ? tokens.accent : tokens.border,
          },
        ]}
      >
        {draftColor ? (
          <View style={[styles.draftColorMark, { backgroundColor: draftColor }]} />
        ) : null}
        <TextInput
          ref={inputRef ?? localInputRef}
          value={text}
          onChangeText={(v) => {
            setText(v);
            if (emptyHint && v.trim()) setEmptyHint(false);
          }}
          placeholder={placeholder}
          placeholderTextColor={tokens.mutedText}
          style={[typography.taskTitle, styles.input, { color: tokens.text }]}
          returnKeyType="done"
          onSubmitEditing={submit}
          onFocus={() => {
            suppressBlurRef.current = false;
            setFocused(true);
          }}
          onBlur={() => {
            setTimeout(() => {
              if (submitDismissRef.current) {
                submitDismissRef.current = false;
                setFocused(false);
                return;
              }
              if (pickerOpenRef.current || suppressBlurRef.current) {
                focusInput();
                return;
              }
              setFocused(false);
              if (!draftActiveRef.current) onDismissEmpty?.();
            }, 120);
          }}
          submitBehavior="submit"
        />
        {text.trim() ? (
          <Pressable
            onPress={submit}
            style={({ pressed }) => [
              styles.dismissBtn,
              { backgroundColor: tokens.accent },
              pressed && { opacity: 0.8 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Add task"
            hitSlop={8}
          >
            <Ionicons name="arrow-up" size={18} color={tokens.onAccent} />
          </Pressable>
        ) : toolbarVisible ? (
          <Pressable
            onPress={restoreInputVisible ? focusInput : () => dismissInput()}
            style={({ pressed }) => [
              styles.dismissBtn,
              { backgroundColor: tokens.sectionBg },
              pressed && { opacity: 0.75 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              restoreInputVisible ? 'Show keyboard' : 'Dismiss keyboard'
            }
            hitSlop={8}
          >
            <Ionicons
              name={restoreInputVisible ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={tokens.mutedText}
            />
          </Pressable>
        ) : null}
      </View>
      {emptyHint ? (
        <Text style={[styles.hint, { color: tokens.mutedText }]}>
          Type something to add a task.
        </Text>
      ) : parsedHint ? (
        <Text style={[styles.hint, { color: tokens.accent }]} numberOfLines={1}>
          {parsedHint}
        </Text>
      ) : null}
      </Animated.View>

      <CalendarDatePicker
        visible={showCalendar}
        selectedDate={draftDatePick === 'pick' ? draftDueDate : undefined}
        onClose={closeCalendar}
        onSelect={(iso) => {
          setDraftDatePick('pick');
          setDraftDueDate(iso);
          if (!isToday(iso)) setDraftPinned(false);
          focusInput();
        }}
      />
      <QuickTimePicker
        visible={showTime}
        dueDate={draftDueDate}
        onClose={closeTime}
        onSelect={(reminderAt, dueDate) => {
          setDraftReminderAt(reminderAt);
          if (dueDate && draftDatePick == null) {
            setDraftDatePick('pick');
            setDraftDueDate(dueDate);
          }
          focusInput();
        }}
      />
      <RecurrencePicker
        visible={showRecurrence}
        selected={draftRecurrence}
        onClose={closeRecurrence}
        onSelect={(recurrence) => {
          setDraftRecurrence(recurrence);
          focusInput();
        }}
      />
      <TaskColorPicker
        visible={showColor}
        selectedColor={draftColor}
        onClose={closeColor}
        onSelect={(color) => {
          setDraftColor(color);
          focusInput();
        }}
      />
    </KeyboardStickyView>
  );
}

function ToolbarBtn({
  icon,
  label,
  active,
  onPress,
  tokens,
  colorDot,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  label?: string;
  active?: boolean;
  onPress: () => void;
  tokens: ReturnType<typeof useTheme>['tokens'];
  colorDot?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.toolBtn,
        {
          backgroundColor: active ? tokens.accentSoft : tokens.sectionBg,
          borderColor: active ? tokens.accent : tokens.border,
        },
        pressed && { opacity: 0.8 },
      ]}
      hitSlop={4}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={16}
          color={active ? tokens.accent : tokens.mutedText}
        />
      ) : (
        <Text
          style={[
            typography.meta,
            styles.toolLabel,
            { color: active ? tokens.accent : tokens.mutedText },
          ]}
        >
          {label}
        </Text>
      )}
      {colorDot ? (
        <View style={[styles.colorDot, { backgroundColor: colorDot }]} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sticky: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inactiveSticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: 0,
    paddingBottom: 0,
    borderTopWidth: 0,
    backgroundColor: 'transparent',
  },
  concealed: {
    opacity: 0,
  },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  toolBtn: {
    minHeight: 34,
    minWidth: 38,
    paddingHorizontal: spacing.xs + 2,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  toolLabel: { fontSize: 12 },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  inputWrap: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    minHeight: MIN_TOUCH_TARGET + 4,
    justifyContent: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    ...elevation.floating,
  },
  draftColorMark: {
    width: 3,
    height: 18,
    borderRadius: 2,
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.sm,
    padding: 0,
    margin: 0,
  },
  dismissBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
  },
  hint: {
    fontSize: 13,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
});

/** Alias used on the Today screen. */
export const AddTaskBar = BottomInputBar;
