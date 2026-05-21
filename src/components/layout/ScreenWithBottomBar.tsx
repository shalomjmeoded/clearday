import React from 'react';
import { StyleSheet, TextInput, type StyleProp, type ViewStyle } from 'react-native';

import type { QuickAddOptions } from '@/types/quickAdd';

import { BottomInputBar } from './BottomInputBar';
import { BottomBarInsetProvider } from './BottomBarInsetContext';
import { KeyboardDismissView } from './KeyboardDismissView';
import { Screen } from './Screen';
import { useScreenInsets } from './useScreenInsets';

interface Props {
  children: React.ReactNode;
  onSubmit: (text: string, options?: QuickAddOptions) => void;
  placeholder?: string;
  /** Tab screen (Today) — bar floats above tab bar; list inset includes tab height. */
  aboveTabBar?: boolean;
  header?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  inputRef?: React.RefObject<TextInput | null>;
  showInputBar?: boolean;
  /** Keep quick-add toolbar/input active while picking date, color, etc. */
  keepEditing?: boolean;
  dismissKeyboardOnBackdropPress?: boolean;
}

/**
 * Today / list detail: scrollable content + keyboard-sticky bottom input.
 * Provides bottom-bar list inset via useBottomBarContentInset().
 */
export function ScreenWithBottomBar({
  children,
  onSubmit,
  placeholder,
  aboveTabBar = false,
  header,
  style,
  inputRef,
  showInputBar = true,
  keepEditing = false,
  dismissKeyboardOnBackdropPress = true,
}: Props) {
  const { listBottomInset } = useScreenInsets({
    variant: aboveTabBar ? 'tab' : 'stack',
    hasBottomBar: showInputBar,
    aboveTabBar,
  });

  return (
    <Screen edges={['top']} style={[styles.screen, style]}>
      {header}
      <KeyboardDismissView
        style={styles.flex}
        dismissOnPress={dismissKeyboardOnBackdropPress}
      >
        <BottomBarInsetProvider inset={listBottomInset}>
          {children}
        </BottomBarInsetProvider>
      </KeyboardDismissView>
      {showInputBar ? (
        <BottomInputBar
          aboveTabBar={aboveTabBar}
          onSubmit={onSubmit}
          placeholder={placeholder}
          inputRef={inputRef}
          keepEditing={keepEditing}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
});
