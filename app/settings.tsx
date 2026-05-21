import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';

import { FormScreen } from '@/components/layout/FormScreen';
import { ReminderTimePicker } from '@/components/reminders/ReminderTimePicker';
import {
  SettingsChips,
  SettingsGroup,
  SettingsRow,
} from '@/components/ui/SettingsGroup';
import {
  runExportWithFeedback,
  runImportWithFeedback,
  showDeviceTransferHelp,
} from '@/features/backup/backupService';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useListStore } from '@/store/listStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTaskStore } from '@/store/taskStore';
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
  { key: 'yellow', label: 'Yellow' },
  { key: 'pink', label: 'Pink' },
  { key: 'mint', label: 'Mint' },
  { key: 'sky', label: 'Sky' },
  { key: 'graphite', label: 'Graphite' },
];

const BEHAVIOR_OPTIONS: { key: CompletedTaskBehavior; label: string }[] = [
  { key: 'collapse', label: 'Collapse' },
  { key: 'hide', label: 'Hide' },
  { key: 'show', label: 'Show' },
];

export default function SettingsScreen() {
  const { tokens } = useTheme();
  const settings = useSettingsStore((s) => s.settings);
  const isPro = settings.isPro;
  const setSetting = useSettingsStore((s) => s.setSetting);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const refreshAll = useTaskStore((s) => s.refreshAll);
  const refreshLists = useListStore((s) => s.refresh);
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const defaultTime = parseTimeKey(settings.defaultReminderTime);
  const [pickerHours, setPickerHours] = useState(defaultTime.hours);
  const [pickerMinutes, setPickerMinutes] = useState(defaultTime.minutes);

  const update = async <K extends keyof typeof settings>(
    key: K,
    value: (typeof settings)[K]
  ) => {
    await triggerSelectionHaptic();
    await setSetting(key, value);
  };

  const afterBackupRestore = async () => {
    setBackupBusy(true);
    try {
      await hydrateSettings();
      await refreshAll();
      await refreshLists();
    } finally {
      setBackupBusy(false);
    }
  };

  const handleExport = async () => {
    if (backupBusy) return;
    await triggerSelectionHaptic();
    setBackupBusy(true);
    try {
      await runExportWithFeedback();
    } finally {
      setBackupBusy(false);
    }
  };

  const handleImport = async () => {
    if (backupBusy) return;
    await triggerSelectionHaptic();
    setBackupBusy(true);
    try {
      await runImportWithFeedback(afterBackupRestore);
    } finally {
      setBackupBusy(false);
    }
  };

  const handleSync = async () => {
    if (backupBusy) return;
    await triggerSelectionHaptic();
    showDeviceTransferHelp(handleExport, handleImport);
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
        {backupBusy ? (
          <View style={styles.busyRow}>
            <ActivityIndicator color={tokens.accent} size="small" />
            <Text style={[typography.meta, { color: tokens.mutedText }]}>
              Working on backup…
            </Text>
          </View>
        ) : null}

        <SettingsGroup title="Appearance">
          <SettingsChips
            options={THEME_OPTIONS}
            value={settings.theme}
            onChange={(t) => update('theme', t)}
          />
          <Text style={[typography.meta, styles.hint, { color: tokens.mutedText }]}>
            List color
          </Text>
          <SettingsChips
            options={COLOR_THEME_OPTIONS}
            value={settings.colorTheme}
            onChange={(t) => update('colorTheme', t)}
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

        <SettingsGroup title="Completed tasks">
          <SettingsChips
            options={BEHAVIOR_OPTIONS}
            value={settings.completedTaskBehavior}
            onChange={(b) => update('completedTaskBehavior', b)}
          />
        </SettingsGroup>

        <SettingsGroup title="Reminders">
          <Text style={[typography.meta, styles.hint, { color: tokens.mutedText }]}>
            Default reminder time for new tasks
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
            onPress={handleExport}
            disabled={backupBusy}
          />
          <SettingsRow
            label="Import Backup"
            onPress={handleImport}
            disabled={backupBusy}
          />
          <SettingsRow
            label="Sync between devices"
            value="Manual"
            valueMuted
            onPress={handleSync}
            disabled={backupBusy}
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

        <SettingsGroup title="Account" style={styles.accountGroup}>
          <SettingsRow
            label="ClearDay Pro"
            value={isPro ? 'Active' : undefined}
            onPress={() => router.push('/pro')}
            last
          />
        </SettingsGroup>
      </FormScreen>
    </>
  );
}

const styles = StyleSheet.create({
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
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
