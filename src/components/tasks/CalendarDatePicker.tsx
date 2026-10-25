import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';

import { MIN_TOUCH_TARGET } from '@/constants/layout';
import { toDueDateIso } from '@/utils/dates';
import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { triggerSelectionHaptic } from '@/utils/haptics';

interface Props {
  visible: boolean;
  selectedDate?: string;
  onClose: () => void;
  onSelect: (iso: string) => void;
}

export function CalendarDatePicker({
  visible,
  selectedDate,
  onClose,
  onSelect,
}: Props) {
  const { tokens } = useTheme();
  // Keep the last row clear of the home indicator / gesture bar.
  const sheetBottomPadding = Math.max(useSafeAreaInsets().bottom + spacing.sm, spacing.xl);
  const initial = selectedDate ? startOfDay(new Date(selectedDate)) : startOfDay(new Date());
  const [viewMonth, setViewMonth] = useState(initial);
  const selected = selectedDate ? startOfDay(new Date(selectedDate)) : undefined;
  const today = startOfDay(new Date());

  const weeks = useMemo(() => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
    const rows: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      rows.push(days.slice(i, i + 7));
    }
    return rows;
  }, [viewMonth]);

  const pickDay = async (day: Date) => {
    await triggerSelectionHaptic();
    onSelect(toDueDateIso(day));
    onClose();
  };

  const goPrev = async () => {
    await triggerSelectionHaptic();
    setViewMonth((m) => subMonths(m, 1));
  };

  const goNext = async () => {
    await triggerSelectionHaptic();
    setViewMonth((m) => addMonths(m, 1));
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: tokens.background, paddingBottom: sheetBottomPadding }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.handle, { backgroundColor: tokens.border }]} />
          <View style={styles.headerRow}>
            <Pressable
              onPress={goPrev}
              hitSlop={12}
              style={styles.navBtn}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
            >
              <Ionicons name="chevron-back" size={20} color={tokens.accent} />
            </Pressable>
            <Text style={[typography.screenTitle, styles.monthTitle, { color: tokens.text }]}>
              {format(viewMonth, 'MMMM yyyy')}
            </Text>
            <Pressable
              onPress={goNext}
              hitSlop={12}
              style={styles.navBtn}
              accessibilityRole="button"
              accessibilityLabel="Next month"
            >
              <Ionicons name="chevron-forward" size={20} color={tokens.accent} />
            </Pressable>
          </View>

          <View style={styles.weekdayRow}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, index) => (
              <Text
                key={`${label}-${index}`}
                style={[typography.caption, styles.weekday, { color: tokens.mutedText }]}
              >
                {label}
              </Text>
            ))}
          </View>

          {weeks.map((week, rowIndex) => (
            <View key={rowIndex} style={styles.weekRow}>
              {week.map((day) => {
                const inMonth = isSameMonth(day, viewMonth);
                const isPast = isBefore(startOfDay(day), today);
                const isSelected = selected ? isSameDay(day, selected) : false;
                const isToday = isSameDay(day, today);
                const canSelect = !isPast;
                return (
                  <Pressable
                    key={day.toISOString()}
                    onPress={() => {
                      if (canSelect) void pickDay(day);
                    }}
                    disabled={!canSelect}
                    style={[
                      styles.dayCell,
                      isSelected && canSelect && { backgroundColor: tokens.accent },
                      !isSelected && isToday && {
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: tokens.accent,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        typography.body,
                        styles.dayText,
                        {
                          color: isSelected && canSelect
                            ? tokens.onAccent
                            : isPast
                              ? tokens.mutedText
                              : inMonth
                                ? tokens.text
                                : tokens.mutedText,
                          opacity: isPast ? 0.35 : inMonth ? 1 : 0.45,
                        },
                      ]}
                    >
                      {format(day, 'd')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}

          <Pressable onPress={onClose} style={styles.cancel}>
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
    paddingHorizontal: spacing.lg,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  navBtn: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: { fontSize: 18, flex: 1, textAlign: 'center' },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  dayCell: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  dayText: {
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  cancel: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
});
