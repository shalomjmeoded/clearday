import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { MIN_TOUCH_TARGET } from '@/constants/layout';
import { ReminderTimePicker } from '@/components/reminders/ReminderTimePicker';
import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';
import { buildReminderIso } from '@/utils/reminderTime';
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
  const [showCustom, setShowCustom] = useState(false);
  const [customHours, setCustomHours] = useState(9);
  const [customMinutes, setCustomMinutes] = useState(0);

  const applyTime = async (hours: number, minutes: number) => {
    await triggerSelectionHaptic();
    const reminderAt = buildReminderIso(hours, minutes, dueDate);
    const resolvedDue =
      dueDate ??
      (() => {
        const base = new Date(reminderAt);
        base.setHours(0, 0, 0, 0);
        return base.toISOString();
      })();
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
            style={[styles.sheet, { backgroundColor: tokens.background }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.handle, { backgroundColor: tokens.border }]} />
            <Text style={[typography.screenTitle, styles.title, { color: tokens.text }]}>
              Reminder
            </Text>
            {PRESETS.map((preset) => (
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
                  {preset.hours.toString().padStart(2, '0')}:
                  {preset.minutes.toString().padStart(2, '0')}
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
    paddingBottom: spacing.xl,
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
