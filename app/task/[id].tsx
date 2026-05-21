import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
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
import { ScheduleDatePicker } from '@/components/tasks/ScheduleDatePicker';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { TextField } from '@/components/ui/TextField';
import { getIsPro } from '@/features/pro/subscriptionService';
import { INBOX_LIST_ID } from '@/db/constants';
import { LIST_COLORS } from '@/features/lists/listRepository';
import {
  areLocalNotificationsSupported,
  requestReminderPermission,
} from '@/features/reminders/reminderService';
import { taskRepository } from '@/features/tasks/taskRepository';
import { useListStore } from '@/store/listStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTaskStore } from '@/store/taskStore';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';
import { DEFAULT_RECURRENCE, type TaskRecurrence } from '@/types/recurrence';
import type { Task, TaskPriority } from '@/types/task';
import {
  formatRecurrenceLabel,
  isRecurring,
  RECURRENCE_OPTIONS,
} from '@/utils/recurrence';
import { formatDisplayDate, formatTime } from '@/utils/dates';
import {
  buildReminderIso,
  getHoursMinutesFromIso,
} from '@/utils/reminderTime';
import { triggerLightHaptic } from '@/utils/haptics';
import { paramString } from '@/utils/routeParams';
import { tomorrowIso } from '@/utils/scheduleDates';

const PRIORITIES: { key: TaskPriority; label: string }[] = [
  { key: 'normal', label: 'Normal' },
  { key: 'important', label: 'Important' },
  { key: 'must_do_today', label: 'Must do today' },
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
  const isPro = getIsPro();

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

  const save = async () => {
    if (!taskId) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setTitleError('Add a title to save this task.');
      return;
    }
    setTitleError(undefined);
    setSaving(true);

    try {
      const previousListId = task?.listId;
      const resolvedPriority =
        dueDate && priority === 'must_do_today' ? 'normal' : priority;

      await taskRepository.update(taskId, {
        title: trimmed,
        notes: notes.trim() || undefined,
        priority: resolvedPriority,
        color,
        listId,
        dueDate: task?.status === 'active' ? dueDate : undefined,
        reminderAt: task?.status === 'active' ? reminderAt : undefined,
        recurrence: task?.status === 'active' ? recurrence : DEFAULT_RECURRENCE,
      });
      await refreshViews(previousListId);
      router.back();
    } catch {
      Alert.alert('Could not save', 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

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
    await triggerLightHaptic();
    setReminderAt(buildReminderIso(hours, minutes, dueDate));
  };

  const removeReminder = async () => {
    await triggerLightHaptic();
    setReminderAt(undefined);
  };

  const scheduleTomorrow = async () => {
    if (!taskId) return;
    Keyboard.dismiss();
    await triggerLightHaptic();
    setDueDate(tomorrowIso());
    if (priority === 'must_do_today') setPriority('normal');
    await scheduleTask(taskId, tomorrowIso());
    setTask((prev) => (prev ? { ...prev, dueDate: tomorrowIso(), priority: 'normal' } : prev));
  };

  const pickDate = () => {
    Keyboard.dismiss();
    if (!isPro) {
      Alert.alert(
        'ClearDay Pro',
        'Choose any future date with Pro. Free can use Tomorrow or type dates when adding tasks.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'View Pro', onPress: () => router.push('/pro') },
        ]
      );
      return;
    }
    setShowDatePicker(true);
  };

  const onDatePicked = async (iso: string) => {
    if (!taskId) return;
    await triggerLightHaptic();
    setDueDate(iso);
    if (priority === 'must_do_today') setPriority('normal');
    await scheduleTask(taskId, iso);
    setTask((prev) => (prev ? { ...prev, dueDate: iso, priority: 'normal' } : prev));
  };

  const clearDueDate = async () => {
    if (!taskId) return;
    await triggerLightHaptic();
    setDueDate(undefined);
    await taskRepository.update(taskId, { dueDate: undefined });
    await refreshViews(task?.listId);
    setTask((prev) => (prev ? { ...prev, dueDate: undefined } : prev));
  };

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
            if (titleError && v.trim()) setTitleError(undefined);
          }}
          error={titleError}
          returnKeyType="next"
        />

        <TextField
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        <Text style={[typography.caption, styles.sectionLabel, { color: tokens.mutedText }]}>
          PRIORITY
        </Text>
        <View style={styles.row}>
          {PRIORITIES.map((p) => (
            <Pressable
              key={p.key}
              onPress={() => setPriority(p.key)}
              style={[
                styles.chip,
                {
                  borderColor: tokens.border,
                  backgroundColor:
                    priority === p.key ? tokens.accent : tokens.card,
                },
              ]}
            >
              <Text
                style={{
                  color: priority === p.key ? tokens.onAccent : tokens.text,
                  fontSize: 14,
                }}
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
              await triggerLightHaptic();
              setColor(undefined);
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
          {LIST_COLORS.map((swatch) => (
            <Pressable
              key={swatch}
              onPress={async () => {
                await triggerLightHaptic();
                setColor(swatch);
              }}
              accessibilityRole="button"
              accessibilityLabel="Choose task color"
              style={[
                styles.swatch,
                {
                  backgroundColor: swatch,
                  borderColor: color === swatch ? tokens.text : tokens.border,
                },
                color === swatch && styles.swatchSelected,
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
              onPress={() => setListId(list.id)}
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
                style={{
                  color: listId === list.id ? tokens.onAccent : tokens.text,
                  fontSize: 14,
                }}
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
                <Text style={{ color: tokens.text, fontSize: 14 }}>Tomorrow</Text>
              </Pressable>
              <Pressable
                onPress={pickDate}
                style={[styles.chip, { borderColor: tokens.accent, backgroundColor: tokens.card }]}
              >
                <Text style={{ color: tokens.accent, fontSize: 14 }}>
                  {isPro ? 'Choose date' : 'Choose date (Pro)'}
                </Text>
              </Pressable>
              {dueDate ? (
                <Pressable
                  onPress={clearDueDate}
                  style={[styles.chip, { borderColor: tokens.border, backgroundColor: tokens.card }]}
                >
                  <Text style={{ color: tokens.mutedText, fontSize: 14 }}>Clear date</Text>
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
                {reminderAt ? formatTime(reminderAt) : 'Set time'}
              </Text>
              <Text style={[typography.meta, { color: tokens.mutedText }]}>›</Text>
            </Pressable>
            {reminderAt ? (
              <Pressable onPress={removeReminder} style={styles.removeReminder}>
                <Text style={[typography.meta, { color: tokens.danger }]}>Remove reminder</Text>
              </Pressable>
            ) : null}

            <Text style={[typography.caption, styles.sectionLabel, { color: tokens.mutedText }]}>
              REPEAT
            </Text>
            {isRecurring(recurrence) && !dueDate ? (
              <Text style={[typography.meta, styles.recurrenceHint, { color: tokens.mutedText }]}>
                Set a due date above so repeats know when to start.
              </Text>
            ) : null}
            <View style={styles.row}>
              {RECURRENCE_OPTIONS.map((option) => (
                <Pressable
                  key={option.key}
                  onPress={() => setRecurrence(option.key)}
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
                    style={{
                      color:
                        recurrence === option.key ? tokens.onAccent : tokens.text,
                      fontSize: 14,
                    }}
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
          </>
        )}

        <ReminderTimePicker
          visible={showReminderPicker}
          hours={reminderPickerHours}
          minutes={reminderPickerMinutes}
          onClose={() => setShowReminderPicker(false)}
          onConfirm={applyReminderTime}
        />

        <ScheduleDatePicker
          visible={showDatePicker}
          onClose={() => setShowDatePicker(false)}
          onSelect={onDatePicked}
        />

        <PrimaryButton
          label={saving ? 'Saving…' : 'Save'}
          onPress={save}
          disabled={saving}
        />

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
  destructiveSection: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    gap: spacing.xs,
  },
});
