import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { FormScreen } from '@/components/layout/FormScreen';
import { Screen } from '@/components/layout/Screen';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { TextField } from '@/components/ui/TextField';
import { INBOX_LIST_ID } from '@/db/constants';
import { listRepository } from '@/features/lists/listRepository';
import { useListStore } from '@/store/listStore';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';
import { triggerLightHaptic } from '@/utils/haptics';
import { paramString } from '@/utils/routeParams';

export default function ListEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listId = paramString(id);
  const { tokens } = useTheme();
  const renameList = useListStore((s) => s.renameList);
  const deleteList = useListStore((s) => s.deleteList);

  const [name, setName] = useState('');
  const [found, setFound] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const isInbox = listId === INBOX_LIST_ID;

  useEffect(() => {
    if (!listId) {
      setLoaded(true);
      setFound(false);
      return;
    }
    setLoaded(false);
    listRepository.getById(listId).then((list) => {
      if (list) {
        setName(list.name);
        setFound(true);
      } else {
        setFound(false);
      }
      setLoaded(true);
    });
  }, [listId]);

  const save = async () => {
    if (!listId) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Enter a list name.');
      return;
    }
    setNameError(undefined);
    setSaving(true);
    try {
      await triggerLightHaptic();
      await renameList(listId, trimmed);
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    if (!listId || isInbox) return;
    Alert.alert(
      `Delete “${name.trim()}”?`,
      'Tasks in this list will move to Inbox.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await triggerLightHaptic();
            await deleteList(listId);
            router.back();
          },
        },
      ]
    );
  };

  const headerOptions = {
    headerShown: true as const,
    title: 'List',
    headerStyle: { backgroundColor: tokens.background },
    headerTintColor: tokens.accent,
    headerShadowVisible: false,
  };

  if (!loaded) {
    return (
      <>
        <Stack.Screen options={headerOptions} />
        <Screen variant="stack" edges={['bottom']} style={styles.centered}>
          <Text style={{ color: tokens.mutedText }}>Loading…</Text>
        </Screen>
      </>
    );
  }

  if (!listId || !found) {
    return (
      <>
        <Stack.Screen options={headerOptions} />
        <Screen variant="stack" edges={['bottom']} style={styles.centered}>
          <Text style={[typography.body, { color: tokens.mutedText, marginBottom: spacing.lg }]}>
            This list is no longer here.
          </Text>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={[typography.button, { color: tokens.accent }]}>Go back</Text>
          </Pressable>
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={headerOptions} />
      <FormScreen modalHeader>
        <TextField
          label="Name"
          value={name}
          onChangeText={(v) => {
            setName(v);
            if (nameError && v.trim()) setNameError(undefined);
          }}
          error={nameError}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={save}
        />

        <PrimaryButton
          label={saving ? 'Saving…' : 'Save name'}
          onPress={save}
          disabled={saving}
        />

        {!isInbox ? (
          <View style={styles.actions}>
            <PrimaryButton
              label="Delete list"
              onPress={confirmDelete}
              variant="danger"
            />
          </View>
        ) : null}
      </FormScreen>
    </>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  actions: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
  },
});
