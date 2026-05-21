import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Stack } from 'expo-router';

import { FormScreen } from '@/components/layout/FormScreen';
import { ReminderTimePicker } from '@/components/reminders/ReminderTimePicker';
import {
  runExportWithFeedback,
  runImportWithFeedback,
} from '@/features/backup/backupService';
import {
  SettingsChips,
  SettingsGroup,
  SettingsRow,
} from '@/components/ui/SettingsGroup';
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

  const handleImport = () => {
    void runImportWithFeedback(async () => {
      await hydrateSettings();
      await refreshAll();
      await refreshLists();
    });
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

        <SettingsGroup title="Pro">
          <SettingsRow
            label={isPro ? 'Do! Pro' : 'Upgrade to Pro'}
            value={isPro ? 'Active' : undefined}
            onPress={() => router.push('/pro')}
          />
          <SettingsRow
            label="Recurring Task"
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
            onPress={() => void runExportWithFeedback()}
          />
          <SettingsRow
            label="Import Backup"
            onPress={handleImport}
          />
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
