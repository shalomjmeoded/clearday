import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { MIN_TOUCH_TARGET } from '@/constants/layout';
import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';
import {
  formatTimeKey,
  formatTimeKeyLabel,
  HOUR_OPTIONS,
  MINUTE_OPTIONS,
  padTimeUnit,
} from '@/utils/reminderTime';
import { triggerSelectionHaptic } from '@/utils/haptics';

const ROW_HEIGHT = 44;

interface Props {
  visible: boolean;
  hours: number;
  minutes: number;
  onClose: () => void;
  onConfirm: (hours: number, minutes: number) => void;
}

export function ReminderTimePicker({
  visible,
  hours: initialHours,
  minutes: initialMinutes,
  onClose,
  onConfirm,
}: Props) {
  const { tokens } = useTheme();
  const [hours, setHours] = useState(initialHours);
  const [minutes, setMinutes] = useState(initialMinutes);
  const hourRef = useRef<ScrollView>(null);
  const minuteRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!visible) return;
    setHours(initialHours);
    setMinutes(initialMinutes);
    const timer = setTimeout(() => {
      hourRef.current?.scrollTo({ y: initialHours * ROW_HEIGHT, animated: false });
      minuteRef.current?.scrollTo({ y: initialMinutes * ROW_HEIGHT, animated: false });
    }, 0);
    return () => clearTimeout(timer);
  }, [visible, initialHours, initialMinutes]);

  const syncFromScroll = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
    options: number[],
    setter: (value: number) => void
  ) => {
    const index = Math.round(event.nativeEvent.contentOffset.y / ROW_HEIGHT);
    const clamped = Math.min(Math.max(index, 0), options.length - 1);
    setter(options[clamped] ?? 0);
  };

  const confirm = async () => {
    await triggerSelectionHaptic();
    onConfirm(hours, minutes);
    onClose();
  };

  const preview = formatTimeKeyLabel(formatTimeKey(hours, minutes));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: tokens.background }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.handle, { backgroundColor: tokens.border }]} />
          <Text style={[typography.screenTitle, styles.title, { color: tokens.text }]}>
            Reminder time
          </Text>
          <Text style={[typography.heroTitle, styles.preview, { color: tokens.accent }]}>
            {preview}
          </Text>

          <View style={styles.pickerRow}>
            <View style={[styles.columnWrap, { borderColor: tokens.border }]}>
              <Text style={[typography.caption, styles.colLabel, { color: tokens.mutedText }]}>
                Hour
              </Text>
              <View style={[styles.fade, styles.fadeTop, { backgroundColor: tokens.background }]} />
              <ScrollView
                ref={hourRef}
                style={styles.column}
                showsVerticalScrollIndicator={false}
                snapToInterval={ROW_HEIGHT}
                decelerationRate="fast"
                contentContainerStyle={styles.columnContent}
                onMomentumScrollEnd={(e) => syncFromScroll(e, HOUR_OPTIONS, setHours)}
                onScrollEndDrag={(e) => syncFromScroll(e, HOUR_OPTIONS, setHours)}
              >
                {HOUR_OPTIONS.map((h) => {
                  const active = h === hours;
                  return (
                    <Pressable
                      key={h}
                      onPress={async () => {
                        await triggerSelectionHaptic();
                        setHours(h);
                        hourRef.current?.scrollTo({ y: h * ROW_HEIGHT, animated: true });
                      }}
                      style={[styles.cell, active && { backgroundColor: tokens.accentSoft }]}
                    >
                      <Text
                        style={[
                          typography.body,
                          {
                            color: active ? tokens.accent : tokens.mutedText,
                            fontWeight: active ? '600' : '400',
                            fontVariant: ['tabular-nums'],
                          },
                        ]}
                      >
                        {padTimeUnit(h)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={[styles.fade, styles.fadeBottom, { backgroundColor: tokens.background }]} />
            </View>

            <Text style={[styles.colon, { color: tokens.mutedText }]}>:</Text>

            <View style={[styles.columnWrap, { borderColor: tokens.border }]}>
              <Text style={[typography.caption, styles.colLabel, { color: tokens.mutedText }]}>
                Min
              </Text>
              <View style={[styles.fade, styles.fadeTop, { backgroundColor: tokens.background }]} />
              <ScrollView
                ref={minuteRef}
                style={styles.column}
                showsVerticalScrollIndicator={false}
                snapToInterval={ROW_HEIGHT}
                decelerationRate="fast"
                contentContainerStyle={styles.columnContent}
                onMomentumScrollEnd={(e) => syncFromScroll(e, MINUTE_OPTIONS, setMinutes)}
                onScrollEndDrag={(e) => syncFromScroll(e, MINUTE_OPTIONS, setMinutes)}
              >
                {MINUTE_OPTIONS.map((m) => {
                  const active = m === minutes;
                  return (
                    <Pressable
                      key={m}
                      onPress={async () => {
                        await triggerSelectionHaptic();
                        setMinutes(m);
                        minuteRef.current?.scrollTo({ y: m * ROW_HEIGHT, animated: true });
                      }}
                      style={[styles.cell, active && { backgroundColor: tokens.accentSoft }]}
                    >
                      <Text
                        style={[
                          typography.body,
                          {
                            color: active ? tokens.accent : tokens.mutedText,
                            fontWeight: active ? '600' : '400',
                            fontVariant: ['tabular-nums'],
                          },
                        ]}
                      >
                        {padTimeUnit(m)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={[styles.fade, styles.fadeBottom, { backgroundColor: tokens.background }]} />
            </View>
          </View>

          <Pressable
            onPress={confirm}
            style={[styles.doneBtn, { backgroundColor: tokens.accent }]}
          >
            <Text style={[typography.button, { color: tokens.onAccent }]}>Done</Text>
          </Pressable>
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
    textAlign: 'center',
  },
  preview: {
    textAlign: 'center',
    fontSize: 32,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    fontWeight: '500',
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  columnWrap: {
    flex: 1,
    maxWidth: 120,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  colLabel: {
    textAlign: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  column: { height: ROW_HEIGHT * 5 },
  columnContent: {
    paddingVertical: ROW_HEIGHT * 2,
  },
  cell: {
    height: ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colon: {
    fontSize: 28,
    fontWeight: '300',
    marginTop: spacing.lg,
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ROW_HEIGHT * 1.5,
    opacity: 0.92,
    zIndex: 1,
    pointerEvents: 'none',
  },
  fadeTop: { top: 28 },
  fadeBottom: { bottom: 0 },
  doneBtn: {
    marginHorizontal: spacing.lg,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancel: {
    alignItems: 'center',
    paddingTop: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
});
