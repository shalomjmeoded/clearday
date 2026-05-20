import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';

import { MIN_TOUCH_TARGET } from '@/constants/layout';
import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';
import { triggerLightHaptic } from '@/utils/haptics';

import { useScreenInsets } from './useScreenInsets';

interface Props {
  onSubmit: (text: string) => void;
  placeholder?: string;
  /** Lift above the tab bar on tab screens (keyboard closed). */
  aboveTabBar?: boolean;
}

/** Sticks above the keyboard; safe-area padding when keyboard is closed. */
export function BottomInputBar({
  onSubmit,
  placeholder = 'Add something…',
  aboveTabBar = false,
}: Props) {
  const { tokens } = useTheme();
  const { bottomSafe, tabBarHeight } = useScreenInsets({
    variant: aboveTabBar ? 'tab' : 'stack',
    aboveTabBar,
  });
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [emptyHint, setEmptyHint] = useState(false);

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setEmptyHint(true);
      return;
    }
    setEmptyHint(false);
    await triggerLightHaptic();
    onSubmit(trimmed);
    setText('');
  };

  const bar = (
    <KeyboardStickyView
      offset={{ closed: 0, opened: spacing.sm }}
      style={[
        styles.sticky,
        {
          backgroundColor: tokens.background,
          borderTopColor: tokens.border,
          paddingBottom: aboveTabBar ? spacing.sm : Math.max(bottomSafe, spacing.sm),
        },
      ]}
    >
      <View
        style={[
          styles.inputWrap,
          {
            backgroundColor: tokens.inputBg,
            borderColor: focused ? tokens.accent : tokens.border,
          },
        ]}
      >
        <TextInput
          value={text}
          onChangeText={(v) => {
            setText(v);
            if (emptyHint && v.trim()) setEmptyHint(false);
          }}
          placeholder={placeholder}
          placeholderTextColor={tokens.mutedText}
          style={[typography.body, styles.input, { color: tokens.text }]}
          returnKeyType="done"
          onSubmitEditing={submit}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          blurOnSubmit={false}
        />
      </View>
      {emptyHint ? (
        <Text style={[styles.hint, { color: tokens.mutedText }]}>
          Type something to add a task.
        </Text>
      ) : null}
    </KeyboardStickyView>
  );

  if (aboveTabBar) {
    return <View style={{ marginBottom: tabBarHeight }}>{bar}</View>;
  }

  return bar;
}

const styles = StyleSheet.create({
  sticky: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputWrap: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    minHeight: MIN_TOUCH_TARGET + 8,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  input: {
    paddingVertical: spacing.md,
    padding: 0,
    margin: 0,
  },
  hint: {
    fontSize: 13,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
});

/** Alias used on the Today screen. */
export const AddTaskBar = BottomInputBar;
