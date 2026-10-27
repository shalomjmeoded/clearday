import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { MIN_TOUCH_TARGET } from '@/constants/layout';
import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TaskRecurrence } from '@/types/recurrence';
import { RECURRENCE_OPTIONS } from '@/utils/recurrence';
import { triggerSelectionHaptic } from '@/utils/haptics';

interface Props {
  visible: boolean;
  selected?: TaskRecurrence;
  onClose: () => void;
  onSelect: (recurrence: TaskRecurrence) => void;
}

/** Repeat options sheet, matching the quick-add time and color pickers. */
export function RecurrencePicker({
  visible,
  selected,
  onClose,
  onSelect,
}: Props) {
  const { tokens } = useTheme();
  // Keep the last row clear of the home indicator / gesture bar.
  const sheetBottomPadding = Math.max(useSafeAreaInsets().bottom + spacing.sm, spacing.xl);

  const choose = async (recurrence: TaskRecurrence) => {
    await triggerSelectionHaptic();
    onSelect(recurrence);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessible={false}>
        <Pressable
          style={[styles.sheet, { backgroundColor: tokens.background, paddingBottom: sheetBottomPadding }]}
          onPress={(e) => e.stopPropagation()}
          accessible={false}
          onAccessibilityEscape={onClose}
        >
          <View style={[styles.handle, { backgroundColor: tokens.border }]} />
          <Text
            style={[typography.screenTitle, styles.title, { color: tokens.text }]}
            accessibilityRole="header"
          >
            Repeat
          </Text>
          {RECURRENCE_OPTIONS.map((option) => {
            const active = (selected ?? 'none') === option.key;
            return (
              <Pressable
                key={option.key}
                onPress={() => choose(option.key)}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                // Explicit, so the checkmark glyph on the active row cannot
                // leak into the label derived from children.
                accessibilityLabel={option.label}
                style={({ pressed }) => [
                  styles.row,
                  { borderBottomColor: tokens.border },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text
                  style={[
                    typography.body,
                    { color: active ? tokens.accent : tokens.text },
                  ]}
                >
                  {option.label}
                </Text>
                {active ? (
                  <Ionicons name="checkmark" size={17} color={tokens.accent} />
                ) : null}
              </Pressable>
            );
          })}
          <Pressable onPress={onClose} style={styles.cancel} accessibilityRole="button">
            <Text style={[typography.button, { color: tokens.mutedText }]}>Cancel</Text>
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
