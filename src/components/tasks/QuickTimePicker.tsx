import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { MIN_TOUCH_TARGET } from '@/constants/layout';
import { ReminderTimePicker } from '@/components/reminders/ReminderTimePicker';
import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useSettingsStore } from '@/store/settingsStore';
import { useTheme } from '@/theme/ThemeProvider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDisplayDate, formatTime, toDueDateIso } from '@/utils/dates';
import {
  buildReminderIso,
  formatTimeKey,
  formatTimeKeyLabel,
  isReminderPast,
  parseTimeKey,
} from '@/utils/reminderTime';
import { triggerSelectionHaptic } from '@/utils/haptics';

const PRESETS = [
  { label: 'Morning', hours: 9, minutes: 0 },
  { label: 'Afternoon', hours: 13, minutes: 0 },
  { label: 'Evening', hours: 18, minutes: 0 },
] as const;

interface Props {
  visible: boolean;
  dueDate?: string;
  onClose: () => void;
  onSelect: (reminderAt: string, dueDate?: string) => void;
}

export function QuickTimePicker({ visible, dueDate, onClose, onSelect }: Props) {
  const { tokens } = useTheme();
  // Keep the last row clear of the home indicator / gesture bar.
  const sheetBottomPadding = Math.max(useSafeAreaInsets().bottom + spacing.sm, spacing.xl);
  const defaultReminderTime = useSettingsStore(
    (s) => s.settings.defaultReminderTime
  );
  const defaultTime = parseTimeKey(defaultReminderTime);
  const [showCustom, setShowCustom] = useState(false);
  const [customHours, setCustomHours] = useState(defaultTime.hours);
  const [customMinutes, setCustomMinutes] = useState(defaultTime.minutes);

  // The user's default leads the list; a preset at the same time is dropped to avoid a duplicate.
  const presets = [
    { label: 'Default', hours: defaultTime.hours, minutes: defaultTime.minutes },
    ...PRESETS.filter(
      (preset) =>
        formatTimeKey(preset.hours, preset.minutes) !== defaultReminderTime
    ),
  ];

  const applyTime = async (hours: number, minutes: number) => {
    const reminderAt = buildReminderIso(hours, minutes, dueDate);
    if (isReminderPast(reminderAt)) {
      Alert.alert(
        'That time has passed',
        `${formatDisplayDate(dueDate)} at ${formatTime(reminderAt)} is already behind us. Pick a later time or another day.`
      );
      return;
    }
    await triggerSelectionHaptic();
    const resolvedDue = dueDate ?? toDueDateIso(new Date(reminderAt));
    onSelect(reminderAt, resolvedDue);
    onClose();
    setShowCustom(false);
  };

  const openCustom = async () => {
    await triggerSelectionHaptic();
    setShowCustom(true);
  };

  return (
    <>
      <Modal visible={visible && !showCustom} animationType="slide" transparent onRequestClose={onClose}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable
            style={[styles.sheet, { backgroundColor: tokens.background, paddingBottom: sheetBottomPadding }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.handle, { backgroundColor: tokens.border }]} />
            <Text style={[typography.screenTitle, styles.title, { color: tokens.text }]}>
              Reminder
            </Text>
            {presets.map((preset) => (
              <Pressable
                key={preset.label}
                onPress={() => applyTime(preset.hours, preset.minutes)}
                style={({ pressed }) => [
                  styles.row,
                  { borderBottomColor: tokens.border },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={[typography.body, { color: tokens.text }]}>{preset.label}</Text>
                <Text style={[typography.meta, { color: tokens.mutedText }]}>
                  {formatTimeKeyLabel(formatTimeKey(preset.hours, preset.minutes))}
                </Text>
              </Pressable>
            ))}
            <Pressable
              onPress={openCustom}
              style={({ pressed }) => [
                styles.row,
                { borderBottomColor: tokens.border },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={[typography.body, { color: tokens.accent }]}>Custom time</Text>
            </Pressable>
            <Pressable onPress={onClose} style={styles.cancel}>
              <Text style={[typography.button, { color: tokens.mutedText }]}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <ReminderTimePicker
        visible={showCustom}
        hours={customHours}
        minutes={customMinutes}
        onClose={() => setShowCustom(false)}
        onConfirm={(hours, minutes) => {
          setCustomHours(hours);
          setCustomMinutes(minutes);
          void applyTime(hours, minutes);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  title: {
    paddingHorizontal: spacing.lg,
    fontSize: 20,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: MIN_TOUCH_TARGET,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cancel: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
});
