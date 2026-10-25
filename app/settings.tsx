import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Linking, StyleSheet, Text } from 'react-native';
import { Stack } from 'expo-router';

import { FormScreen } from '@/components/layout/FormScreen';
import { ReminderTimePicker } from '@/components/reminders/ReminderTimePicker';
import {
  SettingsChips,
  SettingsGroup,
  SettingsRow,
} from '@/components/ui/SettingsGroup';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useSettingsStore } from '@/store/settingsStore';
import { useListStore } from '@/store/listStore';
import { useTaskStore } from '@/store/taskStore';
import { useProStore } from '@/store/proStore';
import {
  getLastBackupAt,
  runExportWithFeedback,
  runImportWithFeedback,
} from '@/features/backup/backupService';
import {
  getSnapshotInfo,
  restoreSnapshot,
  type SnapshotInfo,
} from '@/db/snapshot';
import {
  getReminderPermissionStatus,
  requestReminderPermission,
  syncScheduledReminders,
  type ReminderPermissionStatus,
} from '@/features/reminders/reminderService';
import { useTheme } from '@/theme/ThemeProvider';
import type {
  ColorTheme,
  CompletedTaskBehavior,
  ThemeMode,
} from '@/types/settings';
import { triggerSelectionHaptic } from '@/utils/haptics';
import {
  BACKUP_SECTION_BODY,
  BACKUP_SECTION_HELPER,
  PRIVACY_LOCAL_STORAGE_NOTE,
  PRIVACY_MAIN_LINE,
} from '@/constants/privacyCopy';
import {
  formatTimeKey,
  formatTimeKeyLabel,
  getHoursMinutesFromIso,
  parseTimeKey,
} from '@/utils/reminderTime';

const THEME_OPTIONS: { key: ThemeMode; label: string }[] = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
];

const COLOR_THEME_OPTIONS: { key: ColorTheme; label: string }[] = [
  { key: 'classic', label: 'Classic' },
  { key: 'mint', label: 'Mint' },
  { key: 'sky', label: 'Sky' },
  { key: 'yellow', label: 'Yellow' },
  { key: 'pink', label: 'Pink' },
  { key: 'graphite', label: 'Graphite' },
];

const FREE_COLOR_THEMES = new Set<ColorTheme>(['classic', 'mint', 'sky']);

const BEHAVIOR_OPTIONS: { key: CompletedTaskBehavior; label: string }[] = [
  { key: 'collapse', label: 'Collapse' },
  { key: 'hide', label: 'Hide' },
  { key: 'show', label: 'Show' },
];

export default function SettingsScreen() {
  const { tokens } = useTheme();
  const settings = useSettingsStore((s) => s.settings);
  const isPro = useProStore((s) => s.isPro);
  const proNotice = useProStore((s) => s.notice);
  const setSetting = useSettingsStore((s) => s.setSetting);
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [backupBusy, setBackupBusy] = useState<
    'export' | 'import' | 'restore' | null
  >(null);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotInfo | null>(null);

  const refreshBackupInfo = useCallback(async () => {
    const [last, snap] = await Promise.all([getLastBackupAt(), getSnapshotInfo()]);
    setLastBackupAt(last);
    setSnapshot(snap);
  }, []);

  useEffect(() => {
    void refreshBackupInfo();
  }, [refreshBackupInfo]);

  const rehydrateAll = async () => {
    await useSettingsStore.getState().hydrate();
    await useListStore.getState().refresh();
    await useTaskStore.getState().refreshAll();
  };

  const confirmRestoreSnapshot = () => {
    const when = snapshot?.takenAt
      ? snapshot.takenAt.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : 'the last update';
    Alert.alert(
      'Go back to the pre-update copy?',
      `Do! kept a copy of your tasks from just before the app last updated (${when}). Restoring it replaces everything on this device with that copy. Changes made since then will be lost.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore copy',
          style: 'destructive',
          onPress: () =>
            void (async () => {
              setBackupBusy('restore');
              try {
                await restoreSnapshot();
                await rehydrateAll();
                Alert.alert('Restored', 'Your tasks are back to the pre-update copy.');
              } catch (error) {
                Alert.alert(
                  'Could not restore',
                  error instanceof Error ? error.message : 'Please try again.'
                );
              } finally {
                setBackupBusy(null);
                void refreshBackupInfo();
              }
            })(),
        },
      ]
    );
  };

  const lastBackupLabel = (() => {
    if (!lastBackupAt) return 'Never exported';
    const date = new Date(lastBackupAt);
    if (Number.isNaN(date.getTime())) return 'Never exported';
    return `Last export ${date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })}`;
  })();
  const defaultTime = parseTimeKey(settings.defaultReminderTime);
  const [pickerHours, setPickerHours] = useState(defaultTime.hours);
  const [pickerMinutes, setPickerMinutes] = useState(defaultTime.minutes);
  const [reminderPermission, setReminderPermission] =
    useState<ReminderPermissionStatus | null>(null);

  const refreshPermission = useCallback(async () => {
    setReminderPermission(await getReminderPermissionStatus());
  }, []);

  // Re-check when coming back from the OS settings app.
  useEffect(() => {
    void refreshPermission();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshPermission();
    });
    return () => subscription.remove();
  }, [refreshPermission]);

  const handlePermissionRow = async () => {
    await triggerSelectionHaptic();
    if (reminderPermission === 'undetermined') {
      const granted = await requestReminderPermission();
      if (granted) void syncScheduledReminders();
      await refreshPermission();
      return;
    }
    if (reminderPermission === 'denied') {
      Alert.alert(
        'Notifications are off',
        'Turn them on in the system settings so reminders can ring.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => void Linking.openSettings() },
        ]
      );
    }
  };

  const permissionLabel: Record<ReminderPermissionStatus, string> = {
    granted: 'Allowed',
    denied: 'Off',
    undetermined: 'Not asked yet',
    unsupported: 'Unavailable',
  };

  const update = async <K extends keyof typeof settings>(
    key: K,
    value: (typeof settings)[K]
  ) => {
    await triggerSelectionHaptic();
    await setSetting(key, value);
  };

  const updateColorTheme = async (colorTheme: ColorTheme) => {
    if (!isPro && !FREE_COLOR_THEMES.has(colorTheme)) {
      Alert.alert(
        'Do! Pro',
        'That one is a premium theme. Classic, Mint, and Sky are included for free.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'View Pro', onPress: () => router.push('/pro') },
        ]
      );
      return;
    }
    await update('colorTheme', colorTheme);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Settings',
          headerStyle: { backgroundColor: tokens.background },
          headerTintColor: tokens.accent,
          headerShadowVisible: false,
        }}
      />
      <FormScreen modalHeader>
        <SettingsGroup title="Appearance">
          <SettingsChips
            options={THEME_OPTIONS}
            value={settings.theme}
            onChange={(t) => update('theme', t)}
          />
          <Text style={[typography.meta, styles.hint, { color: tokens.mutedText }]}>
            App color
          </Text>
          <SettingsChips
            options={COLOR_THEME_OPTIONS}
            value={settings.colorTheme}
            onChange={updateColorTheme}
          />
        </SettingsGroup>

        <SettingsGroup title="Feedback">
          <SettingsRow
            label="Haptics"
            value={settings.hapticsEnabled ? 'On' : 'Off'}
            onPress={() => update('hapticsEnabled', !settings.hapticsEnabled)}
            last
          />
        </SettingsGroup>

        <SettingsGroup title="Pro">
          {/* A billing problem is otherwise only visible on the Pro screen,
              which a subscriber has no reason to open before access lapses. */}
          <SettingsRow
            label={isPro ? 'Do! Pro' : 'Upgrade to Pro'}
            value={
              proNotice?.tone === 'warning'
                ? 'Action needed'
                : isPro
                  ? 'Active'
                  : undefined
            }
            onPress={() => router.push('/pro')}
          />
          <SettingsRow
            label="Recurring Tasks"
            value={isPro ? 'Included' : 'Pro'}
            valueMuted={!isPro}
            onPress={() => router.push('/recurring')}
            last
          />
        </SettingsGroup>

        <SettingsGroup title="Tasks">
          <SettingsChips
            options={BEHAVIOR_OPTIONS}
            value={settings.completedTaskBehavior}
            onChange={(b) => update('completedTaskBehavior', b)}
          />
          <Text style={[typography.meta, styles.hint, { color: tokens.mutedText }]}>
            How completed tasks appear on Today (history is in More → Finished Tasks)
          </Text>
        </SettingsGroup>

        <SettingsGroup title="Lists">
          <SettingsRow
            label="Manage Lists"
            onPress={() => router.push('/lists')}
            last
          />
        </SettingsGroup>

        <SettingsGroup title="Reminders">
          <SettingsRow
            label="Notifications"
            value={reminderPermission ? permissionLabel[reminderPermission] : undefined}
            valueMuted={reminderPermission !== 'granted'}
            onPress={
              reminderPermission === 'denied' || reminderPermission === 'undetermined'
                ? handlePermissionRow
                : undefined
            }
          />
          <Text style={[typography.meta, styles.hint, { color: tokens.mutedText }]}>
            Starting time when you add a reminder
          </Text>
          <SettingsRow
            label="Time"
            value={formatTimeKeyLabel(settings.defaultReminderTime)}
            onPress={() => {
              const { hours, minutes } = getHoursMinutesFromIso(
                undefined,
                settings.defaultReminderTime
              );
              setPickerHours(hours);
              setPickerMinutes(minutes);
              setShowReminderPicker(true);
            }}
            last
          />
        </SettingsGroup>

        <ReminderTimePicker
          visible={showReminderPicker}
          hours={pickerHours}
          minutes={pickerMinutes}
          onClose={() => setShowReminderPicker(false)}
          onConfirm={async (hours, minutes) => {
            await update('defaultReminderTime', formatTimeKey(hours, minutes));
          }}
        />

        <SettingsGroup title="Backup & Restore">
          <Text style={[typography.meta, styles.hint, { color: tokens.mutedText }]}>
            {BACKUP_SECTION_BODY}
          </Text>
          <SettingsRow
            label="Export Backup"
            value={backupBusy === 'export' ? 'Exporting…' : lastBackupLabel}
            valueMuted
            disabled={backupBusy !== null}
            onPress={() =>
              void (async () => {
                await triggerSelectionHaptic();
                setBackupBusy('export');
                try {
                  await runExportWithFeedback();
                } finally {
                  setBackupBusy(null);
                  void refreshBackupInfo();
                }
              })()
            }
          />
          <SettingsRow
            label="Import Backup"
            value={backupBusy === 'import' ? 'Importing…' : undefined}
            valueMuted
            disabled={backupBusy !== null}
            onPress={() =>
              void (async () => {
                await triggerSelectionHaptic();
                await runImportWithFeedback(rehydrateAll, (busy) =>
                  setBackupBusy(busy ? 'import' : null)
                );
              })()
            }
          />
          {snapshot ? (
            // Only shown when a pre-update copy actually exists on this device.
            <SettingsRow
              label="Restore Pre-update Copy"
              value={backupBusy === 'restore' ? 'Restoring…' : undefined}
              valueMuted
              disabled={backupBusy !== null}
              onPress={() =>
                void (async () => {
                  await triggerSelectionHaptic();
                  confirmRestoreSnapshot();
                })()
              }
            />
          ) : null}
          <SettingsRow
            label="Cloud Sync"
            value="Coming later"
            valueMuted
            disabled
            last
          />
        </SettingsGroup>

        <Text style={[typography.meta, styles.sectionNote, { color: tokens.mutedText }]}>
          {BACKUP_SECTION_HELPER}
        </Text>

        <SettingsGroup title="Privacy" style={styles.privacyGroup}>
          <Text style={[typography.body, styles.privacyBody, { color: tokens.text }]}>
            {PRIVACY_MAIN_LINE}
          </Text>
          <Text style={[typography.meta, styles.privacyNote, { color: tokens.mutedText }]}>
            {PRIVACY_LOCAL_STORAGE_NOTE}
          </Text>
        </SettingsGroup>

        <SettingsGroup title="Support" style={styles.accountGroup}>
          <SettingsRow
            label="Help"
            onPress={() => router.push('/help')}
          />
          <SettingsRow
            label="Write a Review"
            value="Coming soon"
            valueMuted
            disabled
            last
          />
        </SettingsGroup>
      </FormScreen>
    </>
  );
}

const styles = StyleSheet.create({
  hint: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    textTransform: 'none',
    letterSpacing: 0,
  },
  sectionNote: {
    lineHeight: 20,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.lg,
    textTransform: 'none',
    letterSpacing: 0,
    fontWeight: '400',
  },
  privacyGroup: { marginTop: spacing.sm },
  privacyBody: {
    lineHeight: 22,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    textTransform: 'none',
    letterSpacing: 0,
  },
  privacyNote: {
    lineHeight: 20,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    textTransform: 'none',
    letterSpacing: 0,
    fontWeight: '400',
  },
  accountGroup: { marginTop: spacing.md },
});
