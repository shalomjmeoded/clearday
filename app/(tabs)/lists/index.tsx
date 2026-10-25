import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { ListCreateForm } from '@/components/lists/ListCreateForm';
import { ListRow } from '@/components/lists/ListRow';
import {
  ScrollScreen,
  type ScrollScreenHandle,
} from '@/components/layout/ScrollScreen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { MIN_TOUCH_TARGET } from '@/constants/layout';
import { INBOX_LIST_ID } from '@/db/constants';
import { canCreateCustomList } from '@/features/pro/subscriptionService';
import { taskRepository } from '@/features/tasks/taskRepository';
import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useListStore } from '@/store/listStore';
import { useProStore } from '@/store/proStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTheme } from '@/theme/ThemeProvider';
import {
  triggerLightHaptic,
  triggerMediumHaptic,
} from '@/utils/haptics';

export default function ListsScreen() {
  const { tokens } = useTheme();
  const scrollRef = useRef<ScrollScreenHandle>(null);
  const isPro = useProStore((s) => s.isPro);
  const defaultListId = useSettingsStore((s) => s.settings.defaultListId);
  const lists = useListStore((s) => s.lists);
  const refresh = useListStore((s) => s.refresh);
  const createList = useListStore((s) => s.createList);
  const [showCreate, setShowCreate] = useState(false);
  const [taskCounts, setTaskCounts] = useState<Record<string, number>>({});

  const customListCount = lists.filter((l) => l.id !== INBOX_LIST_ID).length;
  const atListLimit = !isPro && customListCount >= 1;
  const totalOpen = Object.values(taskCounts).reduce((sum, n) => sum + n, 0);
  const summary = `${lists.length} ${lists.length === 1 ? 'list' : 'lists'} · ${totalOpen} open ${
    totalOpen === 1 ? 'task' : 'tasks'
  }`;

  useFocusEffect(
    useCallback(() => {
      refresh();
      let cancelled = false;
      taskRepository.countActiveByList().then((counts) => {
        if (!cancelled) setTaskCounts(counts);
      });
      return () => {
        cancelled = true;
      };
    }, [refresh])
  );

  useEffect(() => {
    if (!showCreate) return;
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd(true), 120);
    return () => clearTimeout(timer);
  }, [showCreate]);

  const promptUpgrade = () => {
    Alert.alert(
      'Do! Pro',
      'Free includes one custom list. Upgrade for unlimited lists.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'View Pro', onPress: () => router.push('/pro') },
      ]
    );
  };

  const handleCreate = async (name: string) => {
    const allowed = await canCreateCustomList();
    if (!allowed) {
      promptUpgrade();
      return;
    }
    await triggerLightHaptic();
    await createList(name);
    setShowCreate(false);
  };

  const openCreate = async () => {
    if (atListLimit) {
      promptUpgrade();
      return;
    }
    await triggerLightHaptic();
    setShowCreate(true);
  };

  const openListEdit = async (listId: string) => {
    await triggerMediumHaptic();
    router.push(`/list/${listId}`);
  };

  const openList = async (listId: string) => {
    await triggerLightHaptic();
    router.push(`/lists/${listId}`);
  };

  return (
    <ScrollScreen
      ref={scrollRef}
      header={<ScreenHeader title="Lists" subtitle={summary} />}
      contentContainerStyle={styles.scroll}
      bottomOffset={56}
    >
      {lists.map((item) => {
        const isTodayDefault = item.id === defaultListId;

        return (
          <ListRow
            key={item.id}
            name={item.name}
            color={item.color}
            taskCount={taskCounts[item.id] ?? 0}
            isTodayDefault={isTodayDefault}
            onPress={() => openList(item.id)}
            onLongPress={() => openListEdit(item.id)}
          />
        );
      })}

      {customListCount === 0 && !showCreate ? (
        <Text style={[typography.body, styles.intro, { color: tokens.mutedText }]}>
          Lists keep work, home, and errands apart. Anything added without a
          list lands in Inbox.
        </Text>
      ) : null}

      {showCreate ? (
        <ListCreateForm
          onCreate={handleCreate}
          onCancel={() => setShowCreate(false)}
        />
      ) : (
        <Pressable
          onPress={openCreate}
          style={[styles.addBtn, { borderColor: tokens.border, minHeight: MIN_TOUCH_TARGET }]}
        >
          <Text style={[typography.button, { color: tokens.accent }]}>
            + New list
          </Text>
        </Pressable>
      )}

      {atListLimit && !isPro ? (
        <Pressable onPress={() => router.push('/pro')} style={styles.upgradeHint}>
          <Text style={[typography.meta, { color: tokens.mutedText }]}>
            Go Pro for unlimited lists →
          </Text>
        </Pressable>
      ) : null}

      <Text style={[typography.meta, styles.footerHint, { color: tokens.mutedText }]}>
        Tap a list to open it · long-press to rename
      </Text>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.sm },
  addBtn: {
    marginTop: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeHint: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  intro: {
    lineHeight: 22,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.sm,
  },
  footerHint: {
    textAlign: 'center',
    marginTop: spacing.lg,
    fontWeight: '400',
    letterSpacing: 0,
  },
});
