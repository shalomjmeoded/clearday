import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { KeyboardDismissView } from './KeyboardDismissView';
import { Screen } from './Screen';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: ('top' | 'bottom')[];
  variant?: 'tab' | 'stack';
  /** @deprecated Use variant="tab" */
  padTabBar?: boolean;
  /** Extra offset for headers (modals with stack header). */
  keyboardVerticalOffset?: number;
  footer?: React.ReactNode;
}

/**
 * Full-screen layout: safe areas + keyboard avoidance + tap-to-dismiss.
 * Put fixed bottom inputs in `footer` (uses keyboard stickiness via sibling).
 */
export function KeyboardAwareScreen({
  children,
  style,
  edges = ['top'],
  variant,
  padTabBar = false,
  keyboardVerticalOffset = 0,
  footer,
}: Props) {
  const resolvedVariant = variant ?? (padTabBar ? 'tab' : 'stack');

  return (
    <Screen edges={edges} variant={resolvedVariant} style={style}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        <KeyboardDismissView style={styles.flex}>{children}</KeyboardDismissView>
        {footer}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
