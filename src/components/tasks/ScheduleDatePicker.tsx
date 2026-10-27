import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MIN_TOUCH_TARGET } from '@/constants/layout';
import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';
import { getUpcomingDayOptions } from '@/utils/scheduleDates';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (iso: string) => void;
}

export function ScheduleDatePicker({ visible, onClose, onSelect }: Props) {
  const { tokens } = useTheme();
  const days = getUpcomingDayOptions(90);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessible={false}>
        <Pressable
          style={[styles.sheet, { backgroundColor: tokens.background }]}
          onPress={(e) => e.stopPropagation()}
          // Without this the sheet is one accessibility element and nothing
          // inside it can be reached.
          accessible={false}
          onAccessibilityEscape={onClose}
        >
          <View style={[styles.handle, { backgroundColor: tokens.border }]} />
          <Text
            style={[typography.screenTitle, styles.title, { color: tokens.text }]}
            accessibilityRole="header"
          >
            Choose a date
          </Text>
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {days.map((day) => (
              <Pressable
                key={day.iso}
                onPress={() => {
                  onSelect(day.iso);
                  onClose();
                }}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.row,
                  { borderBottomColor: tokens.border },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={[typography.body, { color: tokens.text }]}>{day.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable onPress={onClose} style={styles.cancel} accessibilityRole="button">
            <Text style={[typography.button, { color: tokens.accent }]}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    maxHeight: '70%',
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
    marginBottom: spacing.md,
    fontSize: 20,
  },
  list: { maxHeight: 360 },
  row: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cancel: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
});
