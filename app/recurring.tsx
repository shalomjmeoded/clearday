import { router } from 'expo-router';
import { Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { FormScreen } from '@/components/layout/FormScreen';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useProStore } from '@/store/proStore';
import { useTheme } from '@/theme/ThemeProvider';

const HOW_IT_WORKS = [
  'Open a task and pick Daily, Weekly, Every 2 weeks, Monthly, or Yearly under Repeat. Or swipe a row left and tap Repeat.',
  'Marking it done moves the task to its next date and files that occurrence under Finished Tasks, so you can look back on what you actually did. A short banner lets you undo.',
  'Reopening a finished occurrence pulls the task back to that date — handy when you ticked one off by mistake.',
  'Any reminder follows the task to the new day at the same time.',
  'Overdue repeats catch up to the next future date. Month-end and leap-day tasks keep their original day where the month allows.',
];

const KEYWORDS = 'daily · weekly · biweekly · monthly · yearly';

export default function RecurringTasksScreen() {
  const { tokens } = useTheme();
  const isPro = useProStore((s) => s.isPro);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Recurring Tasks',
          headerStyle: { backgroundColor: tokens.background },
          headerTintColor: tokens.accent,
          headerShadowVisible: false,
        }}
      />
      <FormScreen modalHeader>
        <View style={styles.center}>
          <Text style={[typography.heroTitle, styles.title, { color: tokens.text }]}>
            Recurring Tasks
          </Text>
          <Text style={[typography.body, styles.body, { color: tokens.mutedText }]}>
            {isPro
              ? 'Daily, weekly, monthly, and yearly tasks that come back on their own.'
              : 'Create daily, weekly, and monthly tasks automatically with Do! Pro.'}
          </Text>
          {!isPro ? (
            <PrimaryButton label="View Pro" onPress={() => router.push('/pro')} />
          ) : null}
        </View>

        <Text style={[typography.caption, styles.sectionLabel, { color: tokens.mutedText }]}>
          HOW IT WORKS
        </Text>
        {HOW_IT_WORKS.map((line) => (
          <Text
            key={line}
            style={[typography.body, styles.line, { color: tokens.text }]}
          >
            {'· '}
            {line}
          </Text>
        ))}

        <Text style={[typography.caption, styles.sectionLabel, { color: tokens.mutedText }]}>
          QUICK ADD
        </Text>
        <Text style={[typography.body, styles.line, { color: tokens.text }]}>
          Type one of these words in a new task to set the repeat as you go:
        </Text>
        <Text style={[typography.body, styles.keywords, { color: tokens.accent }]}>
          {KEYWORDS}
        </Text>
        <Text style={[typography.meta, styles.line, { color: tokens.mutedText }]}>
          {isPro
            ? 'Example: “Water plants weekly” repeats every week.'
            : 'With Pro, “Water plants weekly” repeats every week. Without it, the word stays in the title.'}
        </Text>
      </FormScreen>
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  title: { textAlign: 'center' },
  body: { textAlign: 'center', lineHeight: 22, paddingHorizontal: spacing.lg },
  sectionLabel: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    letterSpacing: 0.4,
  },
  line: { lineHeight: 22, marginBottom: spacing.sm },
  keywords: { lineHeight: 22, marginBottom: spacing.sm, fontWeight: '600' },
});
