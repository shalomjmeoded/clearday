import React from 'react';
import { StyleSheet, View, type ScrollViewProps } from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';
import {
  KeyboardAwareScrollView,
  KeyboardAwareScrollViewProps,
} from 'react-native-keyboard-controller';

import { spacing } from '@/theme/spacing';
import { useTheme } from '@/theme/ThemeProvider';

import { useScreenInsets } from './useScreenInsets';

interface Props extends Omit<KeyboardAwareScrollViewProps, 'style'> {
  children: React.ReactNode;
  contentContainerStyle?: ScrollViewProps['contentContainerStyle'];
  /** Stack modal with navigation header (task detail, settings, pro). */
  modalHeader?: boolean;
  /** Extra space below last field so actions stay above keyboard. */
  bottomOffset?: number;
}

/** Modal / stack forms: scroll, keyboard-aware insets. */
export function FormScreen({
  children,
  contentContainerStyle,
  modalHeader = false,
  bottomOffset,
  ...scrollProps
}: Props) {
  const { tokens } = useTheme();
  const headerHeight = useHeaderHeight();
  const { formScrollBottomPadding } = useScreenInsets({ variant: 'stack' });

  const resolvedBottomOffset =
    bottomOffset ?? (modalHeader ? headerHeight + spacing.lg : spacing.xxl + spacing.lg);

  return (
    <View style={[styles.root, { backgroundColor: tokens.background }]}>
      <KeyboardAwareScrollView
        style={[styles.scroll, { backgroundColor: tokens.background }]}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: formScrollBottomPadding + spacing.lg },
          contentContainerStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        bottomOffset={resolvedBottomOffset}
        extraKeyboardSpace={spacing.lg}
        nestedScrollEnabled
        {...scrollProps}
      >
        {children}
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
});
