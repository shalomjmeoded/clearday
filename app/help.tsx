import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

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
      'Type naturally when adding tasks:\n\n• “Call Daniel tomorrow 10am”\n• “Pay rent Friday”\n• “Gym today 18:00”\n\nToolbar selections override parsed dates.',
  },
  {
    title: 'Pinning important tasks',
    body:
      'Tap the pin in quick add or set Must do today in task detail. Pinned tasks float near the top of Today and All.',
  },
  {
    title: 'Colors',
    body:
      'Add a thin color marker from quick add or task detail. Colors help scan a list — they do not fill the whole row.',
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
        <ScrollView showsVerticalScrollIndicator={false}>
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
        </ScrollView>
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
