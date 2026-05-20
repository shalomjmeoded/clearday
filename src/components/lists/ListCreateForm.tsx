import React, { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/ui/TextField';
import { MIN_TOUCH_TARGET } from '@/constants/layout';
import { spacing } from '@/theme/spacing';
import { useTheme } from '@/theme/ThemeProvider';

interface Props {
  onCreate: (name: string) => void | Promise<void>;
  onCancel: () => void;
}

export function ListCreateForm({ onCreate, onCancel }: Props) {
  const { tokens } = useTheme();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Enter a list name.');
      return;
    }
    Keyboard.dismiss();
    setError(undefined);
    await onCreate(trimmed);
    setName('');
  };

  return (
    <View style={styles.box}>
      <TextField
        label="List name"
        value={name}
        onChangeText={(v) => {
          setName(v);
          if (error && v.trim()) setError(undefined);
        }}
        placeholder="e.g. Work"
        error={error}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <View style={styles.actions}>
        <Pressable
          onPress={() => {
            Keyboard.dismiss();
            onCancel();
          }}
          style={styles.actionBtn}
        >
          <Text style={{ color: tokens.mutedText }}>Cancel</Text>
        </Pressable>
        <Pressable onPress={submit} style={styles.actionBtn}>
          <Text style={{ color: tokens.accent, fontWeight: '600' }}>Create</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: spacing.md },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.lg,
    marginTop: -spacing.sm,
  },
  actionBtn: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
});
