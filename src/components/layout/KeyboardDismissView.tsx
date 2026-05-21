import React from 'react';
import {
  Keyboard,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** When false, taps on the backdrop do not dismiss the keyboard. */
  dismissOnPress?: boolean;
}

/** Tapping non-interactive areas dismisses the keyboard. */
export function KeyboardDismissView({
  children,
  style,
  dismissOnPress = true,
}: Props) {
  return (
    <TouchableWithoutFeedback
      onPress={dismissOnPress ? Keyboard.dismiss : undefined}
      accessible={false}
    >
      <View style={[styles.fill, style]}>{children}</View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
