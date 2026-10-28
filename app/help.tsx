import { Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { FormScreen } from '@/components/layout/FormScreen';
import {
  BACKUP_SECTION_BODY,
  PRIVACY_MAIN_LINE,
} from '@/constants/privacyCopy';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';

const SECTIONS = [
  {
    title: 'Quick Add',
    body:
      'Tap the + button, type a task, and press return. Use the toolbar above the keyboard for date, time, color, and pin options — or just type and go.',
  },
  {
    title: 'Dates & reminders',
    body:
      'Type naturally when adding tasks:\n\n• “Call Daniel tomorrow 10am”\n• “Pay rent Friday”\n• “Gym today 18:00”\n• “Renew passport in 3 weeks”\n\nA bare time that has already passed means tomorrow, and the day can come before or after the time. Toolbar selections override parsed dates. Moving a task to another day moves its reminder with it.',
  },
  {
    title: 'Repeating tasks (Pro)',
    body:
      'Add “daily”, “weekly”, “biweekly”, “monthly”, or “yearly” to a new task, or use the repeat button in quick add. Marking a repeat done moves it to its next date and files that occurrence under Finished Tasks; a banner lets you undo.',
  },
  {
    title: 'From the notification',
    body:
      'A reminder carries two buttons. Complete ticks the task off without opening the app, and Snooze 1 Hour pushes it back. Tapping the notification itself opens the task.',
  },
  {
    title: 'Pin and star',
    body:
      'Pin (the pin icon in quick add, or Must do today in task detail) floats a task to the top of Today. Star (swipe a row right) marks it important and gives it a ★. Two levels, two icons, used the same way everywhere.',
  },
  {
    title: 'Colors',
    body:
      'Add a thin color marker from quick add or task detail. Colors help scan a list — they do not fill the whole row.',
  },
  {
    title: 'Search',
    body:
      'Tap the magnifier on Today, Schedule, a list, or Finished Tasks. Each screen searches what it shows: Today looks through open tasks in its list plus anything finished today, Schedule through everything dated tomorrow or later, a list through its open and finished tasks, and Finished Tasks through the whole history. Several words find tasks containing all of them, in titles or notes.',
  },
  {
    title: 'Manual sorting',
    body:
      'Choose Manual Sorting from the sort menu on Today, then long-press a row to reorder. Order saves on your device.',
  },
  {
    title: 'Focus Mode',
    body: 'Pick 1–3 tasks from the Focus button on Today. A calm view for what matters right now.',
  },
  {
    title: 'Privacy',
    body: `${PRIVACY_MAIN_LINE}\n\nYour tasks are stored locally on your phone.`,
  },
  {
    title: 'No ads',
    body: 'Do! is designed to stay calm and focused. There are no ads in the app.',
  },
  {
    title: 'Local storage',
    body:
      'Your tasks are stored on this device. Export or import a backup from Settings → Backup & Restore.',
  },
  {
    title: 'Backup',
    body: `${BACKUP_SECTION_BODY} Cloud sync is coming later.`,
  },
] as const;

export default function HelpScreen() {
  const { tokens } = useTheme();

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Help',
          headerStyle: { backgroundColor: tokens.background },
          headerTintColor: tokens.accent,
          headerShadowVisible: false,
        }}
      />
      <FormScreen modalHeader>
        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={[typography.caption, styles.label, { color: tokens.mutedText }]}>
              {section.title.toUpperCase()}
            </Text>
            <Text style={[typography.body, styles.body, { color: tokens.text }]}>
              {section.body}
            </Text>
          </View>
        ))}
      </FormScreen>
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.xl,
  },
  label: {
    marginBottom: spacing.sm,
    letterSpacing: 0.5,
  },
  body: {
    lineHeight: 22,
  },
});
