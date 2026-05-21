import { router } from 'expo-router';
import { Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { FormScreen } from '@/components/layout/FormScreen';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useSettingsStore } from '@/store/settingsStore';
import { useTheme } from '@/theme/ThemeProvider';

export default function RecurringTasksScreen() {
  const { tokens } = useTheme();
  const isPro = useSettingsStore((s) => s.settings.isPro);

  if (!isPro) {
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
              Create daily, weekly, and monthly tasks automatically with ClearDay Pro.
            </Text>
            <PrimaryButton label="View Pro" onPress={() => router.push('/pro')} />
          </View>
        </FormScreen>
      </>
    );
  }

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
          <Text style={[typography.body, styles.coming, { color: tokens.accent }]}>
            Coming soon
          </Text>
          <Text style={[typography.body, styles.body, { color: tokens.mutedText }]}>
            Create daily, weekly, and monthly tasks automatically.
          </Text>
        </View>
      </FormScreen>
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    paddingTop: spacing.xxl,
    alignItems: 'center',
    gap: spacing.md,
  },
  title: { textAlign: 'center' },
  coming: { fontWeight: '600' },
  body: { textAlign: 'center', lineHeight: 22, paddingHorizontal: spacing.lg },
});
