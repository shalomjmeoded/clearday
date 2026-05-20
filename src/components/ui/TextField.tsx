import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';

import { MIN_TOUCH_TARGET } from '@/constants/layout';
import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';

interface Props extends TextInputProps {
  label: string;
  error?: string;
}

export function TextField({ label, error, style, ...props }: Props) {
  const { tokens } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrap}>
      <Text style={[typography.caption, styles.label, { color: tokens.mutedText }]}>
        {label.toUpperCase()}
      </Text>
      <TextInput
        {...props}
        placeholderTextColor={tokens.mutedText}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[
          typography.body,
          styles.input,
          {
            color: tokens.text,
            backgroundColor: tokens.card,
            borderColor: error
              ? tokens.danger
              : focused
                ? tokens.accent
                : tokens.border,
          },
          props.multiline && styles.multiline,
          style,
        ]}
      />
      {error ? (
        <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  label: {
    marginBottom: spacing.sm,
    textTransform: 'none',
    letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
  },
  multiline: {
    minHeight: 120,
    maxHeight: 200,
    textAlignVertical: 'top',
    paddingTop: spacing.md,
  },
  error: {
    fontSize: 13,
    marginTop: spacing.xs,
  },
});
