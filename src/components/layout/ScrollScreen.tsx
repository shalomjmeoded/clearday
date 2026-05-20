import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import {
  StyleSheet,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
} from 'react-native-keyboard-controller';

import { spacing } from '@/theme/spacing';
import { useTheme } from '@/theme/ThemeProvider';

import { KeyboardDismissView } from './KeyboardDismissView';
import { Screen } from './Screen';
import { useScreenInsets } from './useScreenInsets';

export interface ScrollScreenHandle {
  scrollToEnd: (animated?: boolean) => void;
}

interface Props extends Omit<KeyboardAwareScrollViewProps, 'style' | 'contentContainerStyle'> {
  children: React.ReactNode;
  header?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: ScrollViewProps['contentContainerStyle'];
  /** Extra keyboard offset for focused inputs near the bottom. */
  bottomOffset?: number;
}

/**
 * Tab screens with scrollable content and optional inputs (Lists, More).
 * Handles notch, tab bar, home indicator, and keyboard-aware scrolling.
 */
export const ScrollScreen = forwardRef<ScrollScreenHandle, Props>(function ScrollScreen(
  {
    children,
    header,
    style,
    contentContainerStyle,
    bottomOffset = 40,
    ...scrollProps
  },
  ref
) {
  const { tokens } = useTheme();
  const scrollRef = useRef<React.ComponentRef<typeof KeyboardAwareScrollView>>(null);
  const { scrollBottomPadding } = useScreenInsets({ variant: 'tab' });

  useImperativeHandle(ref, () => ({
    scrollToEnd: (animated = true) => {
      scrollRef.current?.scrollToEnd({ animated });
    },
  }));

  return (
    <Screen variant="tab" edges={['top']} style={[styles.screen, style]}>
      <KeyboardDismissView style={styles.flex}>
        {header}
        <KeyboardAwareScrollView
          ref={scrollRef}
          style={[styles.flex, { backgroundColor: tokens.background }]}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: scrollBottomPadding },
            contentContainerStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          bottomOffset={bottomOffset}
          extraKeyboardSpace={spacing.lg}
          {...scrollProps}
        >
          {children}
        </KeyboardAwareScrollView>
      </KeyboardDismissView>
    </Screen>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
});
