import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewProps } from 'react-native';

import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';

export function SettingsGroup({
  title,
  children,
  style,
}: ViewProps & { title: string; children: React.ReactNode }) {
  const { tokens } = useTheme();

  return (
    <View style={[styles.wrap, style]}>
      <Text style={[typography.caption, styles.label, { color: tokens.mutedText }]}>
        {title}
      </Text>
      <View
        style={[
          styles.card,
          { backgroundColor: tokens.card, borderColor: tokens.border },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

export function SettingsRow({
  label,
  value,
  onPress,
  destructive,
  valueMuted,
  disabled,
  last,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  /** Muted badge (e.g. Coming soon). */
  valueMuted?: boolean;
  disabled?: boolean;
  last?: boolean;
}) {
  const { tokens } = useTheme();
  const content = (
    <>
      <Text
        style={[
          typography.body,
          { color: destructive ? tokens.danger : tokens.text },
        ]}
      >
        {label}
      </Text>
      {value !== undefined && (
        <Text
          style={[
            typography.meta,
            { color: valueMuted ? tokens.mutedText : tokens.accent },
          ]}
        >
          {value}
        </Text>
      )}
    </>
  );

  if (!onPress) {
    return (
      <View
        style={[
          styles.row,
          !last && { borderBottomColor: tokens.border, borderBottomWidth: StyleSheet.hairlineWidth },
        ]}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomColor: tokens.border, borderBottomWidth: StyleSheet.hairlineWidth },
        disabled && { opacity: 0.45 },
        pressed && !disabled && { opacity: 0.7 },
      ]}
    >
      {content}
    </Pressable>
  );
}

export function SettingsChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  const { tokens } = useTheme();

  return (
    <View style={styles.chips}>
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={[
              styles.chip,
              {
                backgroundColor: active ? tokens.accent : tokens.sectionBg,
                borderColor: active ? tokens.accent : tokens.border,
              },
            ]}
          >
            <Text
              style={[
                typography.meta,
                {
                  color: active ? tokens.onAccent : tokens.text,
                  textTransform: 'none',
                  letterSpacing: 0,
                },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  label: { marginBottom: spacing.sm, marginLeft: spacing.xs },
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    padding: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
