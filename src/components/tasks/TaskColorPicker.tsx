import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { TASK_COLORS } from '@/constants/taskColors';
import { MIN_TOUCH_TARGET } from '@/constants/layout';
import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { triggerSelectionHaptic } from '@/utils/haptics';

interface Props {
  visible: boolean;
  selectedColor?: string | null;
  onClose: () => void;
  onSelect: (color: string | null) => void;
}

export function TaskColorPicker({ visible, selectedColor, onClose, onSelect }: Props) {
  const { tokens } = useTheme();
  // Keep the card clear of the home indicator / gesture bar.
  const sheetBottomMargin = Math.max(useSafeAreaInsets().bottom + spacing.sm, spacing.xl);

  const pick = async (color: string | null) => {
    await triggerSelectionHaptic();
    onSelect(color);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessible={false}>
        <Pressable
          style={[styles.sheet, { backgroundColor: tokens.background, borderColor: tokens.border, marginBottom: sheetBottomMargin }]}
          onPress={(e) => e.stopPropagation()}
          accessible={false}
          onAccessibilityEscape={onClose}
        >
          <Text
            style={[typography.caption, styles.title, { color: tokens.mutedText }]}
            accessibilityRole="header"
          >
            Color
          </Text>
          <View style={styles.grid} accessibilityRole="radiogroup">
            <Pressable
              onPress={() => pick(null)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selectedColor == null }}
              accessibilityLabel="No color"
              hitSlop={4}
              style={[
                styles.noneSwatch,
                {
                  borderColor: selectedColor == null ? tokens.text : tokens.border,
                  backgroundColor: tokens.card,
                },
              ]}
            >
              <Text style={[typography.meta, { color: tokens.mutedText }]}>None</Text>
            </Pressable>
            {TASK_COLORS.map((item) => (
              <Pressable
                key={item.key}
                onPress={() => pick(item.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selectedColor === item.value }}
                accessibilityLabel={item.label}
                hitSlop={4}
                style={[
                  styles.swatch,
                  {
                    backgroundColor: item.value,
                    borderColor: selectedColor === item.value ? tokens.text : tokens.border,
                  },
                  selectedColor === item.value && styles.swatchSelected,
                ]}
              />
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  sheet: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  title: {
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
  // 36pt here (matching the task-detail swatches) plus 4pt of hitSlop reaches
  // the 44pt guideline. The grid gap is 8pt, so neighbouring hit areas meet
  // without overlapping.
  noneSwatch: {
    minHeight: 36,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    minWidth: MIN_TOUCH_TARGET,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
  },
  swatchSelected: {
    transform: [{ scale: 1.06 }],
  },
});
