import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FormScreen } from '@/components/layout/FormScreen';
import { Screen } from '@/components/layout/Screen';
import { ReminderTimePicker } from '@/components/reminders/ReminderTimePicker';
import { CalendarDatePicker } from '@/components/tasks/CalendarDatePicker';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { TextField } from '@/components/ui/TextField';
import { TASK_COLORS } from '@/constants/taskColors';
import { INBOX_LIST_ID } from '@/db/constants';
import {
  areLocalNotificationsSupported,
  requestReminderPermission,
} from '@/features/reminders/reminderService';
import { taskRepository } from '@/features/tasks/taskRepository';
import { useListStore } from '@/store/listStore';
import { useProStore } from '@/store/proStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTaskStore } from '@/store/taskStore';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';
import { DEFAULT_RECURRENCE, type TaskRecurrence } from '@/types/recurrence';
import type { Task, TaskPriority, UpdateTaskInput } from '@/types/task';
import {
  formatRecurrenceLabel,
  isRecurring,
  RECURRENCE_OPTIONS,
  shiftReminderToDueDate,
} from '@/utils/recurrence';
import { formatDisplayDate, formatTime, isToday, todayRange } from '@/utils/dates';
import {
  buildReminderIso,
  getHoursMinutesFromIso,
  isReminderOnDifferentDay,
  isReminderPast,
} from '@/utils/reminderTime';
import { triggerLightHaptic, triggerSuccessHaptic } from '@/utils/haptics';
import { paramString } from '@/utils/routeParams';
import {
  computeCompletionStats,
  formatCompletionStats,
} from '@/utils/streaks';
import { tomorrowIso } from '@/utils/scheduleDates';

const PRIORITIES: {
  key: TaskPriority;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'normal', label: 'Normal' },
  // Same glyphs as the swipe actions and quick-add toolbar: star = important, pin = today.
  { key: 'important', label: 'Important', icon: 'star-outline' },
  { key: 'must_do_today', label: 'Must do today', icon: 'pin-outline' },
];

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const taskId = paramString(id);
  const { tokens } = useTheme();
  const lists = useListStore((s) => s.lists);
  const refreshLists = useListStore((s) => s.refresh);
  const refreshAll = useTaskStore((s) => s.refreshAll);
  const refreshList = useTaskStore((s) => s.refreshList);
  const archiveTask = useTaskStore((s) => s.archiveTask);
  const completeTask = useTaskStore((s) => s.completeTask);
  const uncompleteTask = useTaskStore((s) => s.uncompleteTask);
  const scheduleTask = useTaskStore((s) => s.scheduleTask);
  const defaultReminderTime = useSettingsStore(
    (s) => s.settings.defaultReminderTime
  );

  const [task, setTask] = useState<Task | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [color, setColor] = useState<string | undefined>();
  const [listId, setListId] = useState(INBOX_LIST_ID);
  const [reminderAt, setReminderAt] = useState<string | undefined>();
  const [dueDate, setDueDate] = useState<string | undefined>();
  const [recurrence, setRecurrence] = useState<TaskRecurrence>(DEFAULT_RECURRENCE);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [reminderPickerHours, setReminderPickerHours] = useState(9);
  const [reminderPickerMinutes, setReminderPickerMinutes] = useState(0);
  const [titleError, setTitleError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const isPro = useProStore((s) => s.isPro);
  const textRef = useRef({ title: '', notes: '', dirty: false });
  const [completionSummary, setCompletionSummary] = useState('');
  const writeQueue = useRef<Promise<void>>(Promise.resolve());

  const refreshViews = useCallback(
    async (previousListId?: string) => {
      await refreshAll();
      if (listId) await refreshList(listId);
      if (previousListId && previousListId !== listId) {
        await refreshList(previousListId);
      }
    },
    [refreshAll, refreshList, listId]
  );

  const moveTaskToList = useCallback(
    async (nextListId: string) => {
      if (!taskId || nextListId === listId) return;
      Keyboard.dismiss();
      const previousListId = listId;
      await triggerLightHaptic();
      setListId(nextListId);
      setTask((current) => (current ? { ...current, listId: nextListId } : current));
      try {
        await taskRepository.update(taskId, { listId: nextListId });
        await refreshAll();
        await refreshList(nextListId);
        if (previousListId !== nextListId) {
          await refreshList(previousListId);
        }
      } catch {
        setListId(previousListId);
        setTask((current) =>
          current ? { ...current, listId: previousListId } : current
        );
        Alert.alert('Could not move', 'Please try again.');
      }
    },
    [listId, refreshAll, refreshList, taskId]
  );

  useEffect(() => {
    refreshLists();
  }, [refreshLists]);

  useEffect(() => {
    if (!taskId) {
      setLoaded(true);
      return;
    }
    setLoaded(false);
    taskRepository.getById(taskId).then((t) => {
      if (t) {
        setTask(t);
        setTitle(t.title);
        setNotes(t.notes ?? '');
        textRef.current = { title: t.title, notes: t.notes ?? '', dirty: false };
        setPriority(t.priority);
        setColor(t.color);
        setListId(t.listId ?? INBOX_LIST_ID);
        setReminderAt(t.reminderAt);
        setDueDate(t.dueDate);
        setRecurrence(t.recurrence ?? DEFAULT_RECURRENCE);
      } else {
        setTask(null);
      }
      setLoaded(true);
    });
  }, [taskId]);

  /**
   * Every edit writes through immediately; there is no Save step. Writes are
   * chained so a field change and a blur-triggered text save cannot read the
   * same row at once and overwrite each other.
   */
  const persist = useCallback(
    (patch: UpdateTaskInput) => {
      if (!taskId) return writeQueue.current;
      writeQueue.current = writeQueue.current
        .catch(() => {})
        .then(async () => {
          setSaving(true);
          try {
            await taskRepository.update(taskId, patch);
            setTask((current) => (current ? { ...current, ...patch } : current));
            await refreshViews(task?.listId);
          } catch {
            Alert.alert(
              'Could not save',
              'Something went wrong. Please try again.'
            );
          } finally {
            setSaving(false);
          }
        });
      return writeQueue.current;
    },
    [refreshViews, task?.listId, taskId]
  );

  // Text commits on blur and when leaving the screen, so typing is not
  // interrupted by a write on every keystroke.
  const commitText = useCallback(async () => {
    const current = textRef.current;
    if (!taskId || !current.dirty) return;
    const trimmed = current.title.trim();
    if (!trimmed) {
      setTitleError('Add a title to keep this task.');
      return;
    }
    setTitleError(undefined);
    textRef.current = { ...current, dirty: false };
    await persist({ title: trimmed, notes: current.notes.trim() || undefined });
  }, [persist, taskId]);

  // Quiet history line for repeating tasks, from the logged occurrences.
  useEffect(() => {
    if (!taskId || !isRecurring(recurrence)) {
      setCompletionSummary('');
      return;
    }
    let cancelled = false;
    taskRepository.getOccurrences(taskId).then((occurrences) => {
      if (cancelled) return;
      const stats = computeCompletionStats(
        occurrences.map((o) => o.dueDate),
        recurrence
      );
      setCompletionSummary(formatCompletionStats(stats));
    });
    return () => {
      cancelled = true;
    };
  }, [taskId, recurrence, task?.dueDate]);

  // Leaving the screen (back gesture, header button) still saves pending text.
  const commitTextRef = useRef(commitText);
  commitTextRef.current = commitText;
  useEffect(
    () => () => {
      void commitTextRef.current();
    },
    []
  );

  const archive = async () => {
    if (!taskId) return;
    Keyboard.dismiss();
    await triggerLightHaptic();
    await archiveTask(taskId);
    router.back();
  };

  const deletePermanent = () => {
    Keyboard.dismiss();
    Alert.alert('Delete task?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!taskId) return;
          const previousListId = task?.listId;
          await triggerLightHaptic();
          try {
            await taskRepository.deletePermanent(taskId);
            await refreshViews(previousListId);
            router.back();
          } catch {
            Alert.alert('Could not delete', 'Please try again.');
          }
        },
      },
    ]);
  };

  const openReminderPicker = () => {
    if (task?.status !== 'active') return;
    Keyboard.dismiss();
    const { hours, minutes } = getHoursMinutesFromIso(
      reminderAt,
      defaultReminderTime
    );
    setReminderPickerHours(hours);
    setReminderPickerMinutes(minutes);
    setShowReminderPicker(true);
  };

  const applyReminderTime = async (hours: number, minutes: number) => {
    if (!areLocalNotificationsSupported()) {
      Alert.alert(
        'Reminders',
        'Local reminders need a development build on Android. Your task will still save without a reminder.'
      );
      return;
    }
    const granted = await requestReminderPermission();
    if (!granted) {
      Alert.alert(
        'Notifications off',
        'Reminders need notification permission. Your task will still save without one.'
      );
      return;
    }
    const next = buildReminderIso(hours, minutes, dueDate);
    if (isReminderPast(next)) {
      Alert.alert(
        'That time has passed',
        dueDate
          ? `${formatDisplayDate(dueDate)} at ${formatTime(next)} is already behind us. Pick a later time or move the due date.`
          : 'Pick a later time.'
      );
      return;
    }
    await triggerLightHaptic();
    setReminderAt(next);
    await persist({ reminderAt: next });
  };

  const removeReminder = async () => {
    Keyboard.dismiss();
    await triggerLightHaptic();
    setReminderAt(undefined);
    await persist({ reminderAt: undefined });
  };

  /** Keep the unsaved reminder on the same clock time when the due day moves. */
  const followDueDate = (nextDueDate: string) => {
    setReminderAt((current) =>
      current ? shiftReminderToDueDate(current, nextDueDate) : current
    );
  };

  const scheduleTomorrow = async () => {
    if (!taskId) return;
    Keyboard.dismiss();
    await triggerLightHaptic();
    const next = tomorrowIso();
    setDueDate(next);
    followDueDate(next);
    if (priority === 'must_do_today') setPriority('normal');
    await scheduleTask(taskId, next);
    setTask((prev) => (prev ? { ...prev, dueDate: next, priority: 'normal' } : prev));
  };

  const pickDate = () => {
    Keyboard.dismiss();
    setShowDatePicker(true);
  };

  const onDatePicked = async (iso: string) => {
    if (!taskId) return;
    await triggerLightHaptic();
    setDueDate(iso);
    followDueDate(iso);
    if (priority === 'must_do_today') setPriority('normal');
    await scheduleTask(taskId, iso);
    setTask((prev) => (prev ? { ...prev, dueDate: iso, priority: 'normal' } : prev));
  };

  const clearDueDate = async () => {
    if (!taskId) return;
    Keyboard.dismiss();
    await triggerLightHaptic();
    setDueDate(undefined);
    await taskRepository.update(taskId, { dueDate: undefined });
    await refreshViews(task?.listId);
    setTask((prev) => (prev ? { ...prev, dueDate: undefined } : prev));
  };

  /** Returns false when the row no longer exists (e.g. a reopened repeat). */
  const reloadTask = async (): Promise<boolean> => {
    if (!taskId) return false;
    const updated = await taskRepository.getById(taskId);
    if (!updated) return false;
    setTask(updated);
    setTitle(updated.title);
    setNotes(updated.notes ?? '');
    textRef.current = {
      title: updated.title,
      notes: updated.notes ?? '',
      dirty: false,
    };
    setPriority(updated.priority);
    setColor(updated.color);
    setListId(updated.listId ?? INBOX_LIST_ID);
    setReminderAt(updated.reminderAt);
    setDueDate(updated.dueDate);
    setRecurrence(updated.recurrence ?? DEFAULT_RECURRENCE);
    return true;
  };

  const toggleDone = async () => {
    if (!taskId || !task) return;
    Keyboard.dismiss();
    if (task.status === 'completed') {
      await triggerLightHaptic();
      await uncompleteTask(taskId);
    } else {
      await triggerSuccessHaptic();
      await completeTask(taskId);
    }
    await refreshViews(task.listId);
    // Reopening a logged repeat folds the record back into the live task,
    // so there is nothing left to show here.
    const stillThere = await reloadTask();
    if (!stillThere) router.back();
  };

  const reminderIsPast = task?.status === 'active' && isReminderPast(reminderAt);
  // Show the day whenever it is not obvious: undated task, or reminder on another day.
  const reminderShowsDay =
    Boolean(reminderAt) &&
    (!dueDate || isReminderOnDifferentDay(reminderAt, dueDate));

  if (!loaded) {
    return (
      <FormScreen modalHeader>
        <View style={styles.loadingPane}>
          <ActivityIndicator color={tokens.accent} />
        </View>
      </FormScreen>
    );
  }

  if (!task) {
    return (
      <>
        <Screen variant="stack" edges={['bottom']} style={styles.centered}>
          <Text style={[typography.body, { color: tokens.mutedText, marginBottom: spacing.lg }]}>
            This task is no longer here.
          </Text>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={[typography.button, { color: tokens.accent }]}>Go back</Text>
          </Pressable>
        </Screen>
      </>
    );
  }

  return (
    <>
      <FormScreen modalHeader>
        <TextField
          label="Title"
          value={title}
          onChangeText={(v) => {
            setTitle(v);
            textRef.current = { ...textRef.current, title: v, dirty: true };
            if (titleError && v.trim()) setTitleError(undefined);
          }}
          onBlur={() => void commitText()}
          error={titleError}
          returnKeyType="done"
        />

        <TextField
          label="Notes"
          value={notes}
          onChangeText={(v) => {
            setNotes(v);
            textRef.current = { ...textRef.current, notes: v, dirty: true };
          }}
          onBlur={() => void commitText()}
          multiline
        />

        <Text style={[typography.caption, styles.sectionLabel, { color: tokens.mutedText }]}>
          PRIORITY · {PRIORITIES.find((p) => p.key === priority)?.label ?? 'Normal'}
        </Text>
        <View style={styles.row}>
          {PRIORITIES.map((p) => (
            <Pressable
              key={p.key}
              onPress={async () => {
                Keyboard.dismiss();
                if (p.key === priority) return;
                await triggerLightHaptic();
                setPriority(p.key);
                // "Must do today" and a later due date contradict each other,
                // so choosing it pulls the task back to today.
                if (p.key === 'must_do_today' && dueDate && !isToday(dueDate)) {
                  const today = todayRange().start;
                  setDueDate(today);
                  followDueDate(today);
                  await persist({ priority: p.key, dueDate: today });
                  return;
                }
                await persist({ priority: p.key });
              }}
              style={[
                styles.chip,
                styles.chipRow,
                {
                  borderColor: tokens.border,
                  backgroundColor:
                    priority === p.key ? tokens.accent : tokens.card,
                },
              ]}
            >
              {p.icon ? (
                <Ionicons
                  name={p.icon}
                  size={14}
                  color={priority === p.key ? tokens.onAccent : tokens.mutedText}
                />
              ) : null}
              <Text
                style={[
                  typography.chip,
                  { color: priority === p.key ? tokens.onAccent : tokens.text },
                ]}
              >
                {p.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[typography.caption, styles.sectionLabel, { color: tokens.mutedText }]}>
          COLOR
        </Text>
        <View style={styles.swatches}>
          <Pressable
            onPress={async () => {
              Keyboard.dismiss();
              await triggerLightHaptic();
              setColor(undefined);
              await persist({ color: undefined });
            }}
            style={[
              styles.noColorSwatch,
              {
                borderColor: color ? tokens.border : tokens.text,
                backgroundColor: tokens.card,
              },
            ]}
          >
            <Text style={[typography.meta, { color: tokens.mutedText }]}>Auto</Text>
          </Pressable>
          {TASK_COLORS.map((item) => (
            <Pressable
              key={item.key}
              onPress={async () => {
                Keyboard.dismiss();
                await triggerLightHaptic();
                setColor(item.value);
                await persist({ color: item.value });
              }}
              accessibilityRole="button"
              accessibilityLabel={`Choose ${item.label}`}
              style={[
                styles.swatch,
                {
                  backgroundColor: item.value,
                  borderColor: color === item.value ? tokens.text : tokens.border,
                },
                color === item.value && styles.swatchSelected,
              ]}
            />
          ))}
        </View>

        <Text style={[typography.caption, styles.sectionLabel, { color: tokens.mutedText }]}>
          LIST
        </Text>
        <View style={styles.row}>
          {lists.map((list) => (
            <Pressable
              key={list.id}
              onPress={() => moveTaskToList(list.id)}
              style={[
                styles.chip,
                {
                  borderColor: tokens.border,
                  backgroundColor:
                    listId === list.id ? tokens.accent : tokens.card,
                },
              ]}
            >
              <Text
                style={[
                  typography.chip,
                  { color: listId === list.id ? tokens.onAccent : tokens.text },
                ]}
              >
                {list.name}
              </Text>
            </Pressable>
          ))}
        </View>

        {task.status === 'active' && (
          <>
            <Text style={[typography.caption, styles.sectionLabel, { color: tokens.mutedText }]}>
              SCHEDULE
            </Text>
            {dueDate ? (
              <Text style={[typography.meta, styles.dueLabel, { color: tokens.mutedText }]}>
                Due {formatDisplayDate(dueDate)}
              </Text>
            ) : null}
            <View style={styles.row}>
              <Pressable
                onPress={scheduleTomorrow}
                style={[styles.chip, { borderColor: tokens.border, backgroundColor: tokens.card }]}
              >
                <Text style={[typography.chip, { color: tokens.text }]}>Tomorrow</Text>
              </Pressable>
              <Pressable
                onPress={pickDate}
                style={[styles.chip, { borderColor: tokens.accent, backgroundColor: tokens.card }]}
              >
                <Text style={[typography.chip, { color: tokens.accent }]}>Choose date</Text>
              </Pressable>
              {dueDate && !isRecurring(recurrence) ? (
                <Pressable
                  onPress={clearDueDate}
                  style={[styles.chip, { borderColor: tokens.border, backgroundColor: tokens.card }]}
                >
                  <Text style={[typography.chip, { color: tokens.mutedText }]}>Clear date</Text>
                </Pressable>
              ) : null}
            </View>

            <Text style={[typography.caption, styles.sectionLabel, { color: tokens.mutedText }]}>
              REMINDER
            </Text>
            <Pressable
              onPress={openReminderPicker}
              style={[styles.reminderBtn, { borderColor: tokens.border }]}
            >
              <Text style={[typography.body, { color: tokens.text }]}>
                {reminderAt
                  ? reminderShowsDay
                    ? `${formatDisplayDate(reminderAt)} · ${formatTime(reminderAt)}`
                    : formatTime(reminderAt)
                  : 'Set time'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={tokens.mutedText} />
            </Pressable>
            {reminderIsPast ? (
              <Text style={[typography.meta, styles.recurrenceHint, { color: tokens.danger }]}>
                This time has already passed, so nothing will ring. Tap to pick a new one.
              </Text>
            ) : null}
            {reminderAt ? (
              <Pressable onPress={removeReminder} style={styles.removeReminder}>
                <Text style={[typography.meta, { color: tokens.danger }]}>Remove reminder</Text>
              </Pressable>
            ) : null}

            <Text style={[typography.caption, styles.sectionLabel, { color: tokens.mutedText }]}>
              REPEAT · {formatRecurrenceLabel(recurrence)}
            </Text>
            <View style={styles.row}>
              {RECURRENCE_OPTIONS.map((option) => (
                <Pressable
                  key={option.key}
                  onPress={async () => {
                    Keyboard.dismiss();
                    if (option.key !== 'none' && !isPro) {
                      Alert.alert(
                        'Do! Pro',
                        'Recurring tasks are included with Pro.',
                        [
                          { text: 'Not now', style: 'cancel' },
                          { text: 'View Pro', onPress: () => router.push('/pro') },
                        ]
                      );
                      return;
                    }
                    await triggerLightHaptic();
                    setRecurrence(option.key);
                    // A repeat always has a start date; the repository fills
                    // in today, so mirror that here rather than show "no date".
                    if (option.key !== 'none' && !dueDate) {
                      setDueDate(todayRange().start);
                      await persist({ recurrence: option.key, dueDate: todayRange().start });
                      return;
                    }
                    await persist({ recurrence: option.key });
                  }}
                  style={[
                    styles.chip,
                    {
                      borderColor: tokens.border,
                      backgroundColor:
                        recurrence === option.key ? tokens.accent : tokens.card,
                    },
                  ]}
                >
                  <Text
                    style={[
                      typography.chip,
                      {
                        color:
                          recurrence === option.key ? tokens.onAccent : tokens.text,
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {isRecurring(recurrence) ? (
              <Text style={[typography.meta, styles.recurrenceHint, { color: tokens.accent }]}>
                Repeats {formatRecurrenceLabel(recurrence).toLowerCase()}
                {dueDate ? ` · next due ${formatDisplayDate(dueDate)}` : ''}
              </Text>
            ) : null}
            {completionSummary ? (
              <Text style={[typography.meta, styles.recurrenceHint, { color: tokens.mutedText }]}>
                {completionSummary}
              </Text>
            ) : null}
          </>
        )}

        <ReminderTimePicker
          visible={showReminderPicker}
          hours={reminderPickerHours}
          minutes={reminderPickerMinutes}
          onClose={() => setShowReminderPicker(false)}
          onConfirm={applyReminderTime}
        />

        <CalendarDatePicker
          visible={showDatePicker}
          selectedDate={dueDate}
          onClose={() => setShowDatePicker(false)}
          onSelect={onDatePicked}
        />

        <PrimaryButton
          label={task.status === 'completed' ? 'Mark as to-do' : 'Mark done'}
          onPress={toggleDone}
        />

        <Text
          style={[
            typography.meta,
            styles.savedNote,
            { color: tokens.mutedText },
          ]}
        >
          {saving ? 'Saving…' : 'Changes save as you make them.'}
        </Text>

        <View style={styles.destructiveSection}>
          <PrimaryButton label="Archive" onPress={archive} variant="ghost" />
          <PrimaryButton
            label="Delete permanently"
            onPress={deletePermanent}
            variant="danger"
          />
        </View>
      </FormScreen>
    </>
  );
}

const styles = StyleSheet.create({
  loadingPane: {
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xxl,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sectionLabel: {
    marginBottom: spacing.sm,
    textTransform: 'none',
    letterSpacing: 0.4,
  },
  dueLabel: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
  },
  noColorSwatch: {
    minHeight: 36,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchSelected: {
    transform: [{ scale: 1.05 }],
  },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  reminderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: spacing.sm,
    minHeight: 44,
  },
  removeReminder: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    marginBottom: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  recurrenceHint: {
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  savedNote: {
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  destructiveSection: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    gap: spacing.xs,
  },
});
