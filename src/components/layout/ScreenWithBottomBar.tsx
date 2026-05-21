import React from 'react';
import { StyleSheet, TextInput, type StyleProp, type ViewStyle } from 'react-native';

import { BottomInputBar } from './BottomInputBar';
import { BottomBarInsetProvider } from './BottomBarInsetContext';
import { KeyboardDismissView } from './KeyboardDismissView';
import { Screen } from './Screen';
import { useScreenInsets } from './useScreenInsets';

interface Props {
  children: React.ReactNode;
  onSubmit: (text: string) => void;
  placeholder?: string;
  /** Tab screen (Today) — bar floats above tab bar; list inset includes tab height. */
  aboveTabBar?: boolean;
  header?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  inputRef?: React.RefObject<TextInput | null>;
  showInputBar?: boolean;
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
}: Props) {
  const { listBottomInset } = useScreenInsets({
    variant: aboveTabBar ? 'tab' : 'stack',
    hasBottomBar: showInputBar,
    aboveTabBar,
  });

  return (
    <Screen edges={['top']} style={[styles.screen, style]}>
      {header}
      <KeyboardDismissView style={styles.flex}>
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
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
});
