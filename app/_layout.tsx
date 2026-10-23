import { ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, useColorScheme } from 'react-native';
import 'react-native-reanimated';

import { BootstrapScreen } from '@/components/layout/BootstrapScreen';
import { ThemedRoot } from '@/components/layout/ThemedRoot';
import { Toast } from '@/components/ui/Toast';
import type { ReminderResponse } from '@/features/reminders/reminderService';
import {
  SPLASH_BACKGROUND_DARK,
  SPLASH_BACKGROUND_LIGHT,
} from '@/constants/brandAssets';
import {
  fullScreenModalOptions,
  modalScreenOptions,
  stackScreenOptions,
} from '@/navigation/screenOptions';
import { useProStore } from '@/store/proStore';
import { buildNavigationTheme } from '@/theme/navigationTheme';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync();

function AppNavigator() {
  const { tokens, isDark } = useTheme();
  const navigationTheme = useMemo(
    () => buildNavigationTheme(tokens, isDark),
    [tokens, isDark]
  );
  const stackOpts = useMemo(() => stackScreenOptions(tokens), [tokens]);
  const taskModalOpts = useMemo(() => modalScreenOptions(tokens, 'Task'), [tokens]);
  const listModalOpts = useMemo(() => modalScreenOptions(tokens, 'List'), [tokens]);
  const settingsModalOpts = useMemo(
    () => modalScreenOptions(tokens, 'Settings'),
    [tokens]
  );
  const proModalOpts = useMemo(() => modalScreenOptions(tokens, 'Do! Pro'), [tokens]);
  const focusModalOpts = useMemo(() => fullScreenModalOptions(tokens), [tokens]);

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <Stack screenOptions={stackOpts}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="task/[id]" options={taskModalOpts} />
        <Stack.Screen name="list/[id]" options={listModalOpts} />
        <Stack.Screen name="focus" options={focusModalOpts} />
        <Stack.Screen name="settings" options={settingsModalOpts} />
        <Stack.Screen name="pro" options={proModalOpts} />
        <Stack.Screen name="help" options={settingsModalOpts} />
        <Stack.Screen name="finished" options={settingsModalOpts} />
        <Stack.Screen name="recurring" options={settingsModalOpts} />
        <Stack.Screen name="lists/[listId]" />
      </Stack>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const colorScheme = useColorScheme();
  const appState = useRef(AppState.currentState);
  const rootBackground =
    colorScheme === 'dark' ? SPLASH_BACKGROUND_DARK : SPLASH_BACKGROUND_LIGHT;

  useEffect(() => {
    async function bootstrap() {
      try {
        const isWebPaywall =
          Platform.OS === 'web' &&
          typeof window !== 'undefined' &&
          window.location.pathname.startsWith('/pro');

        if (isWebPaywall) {
          void useProStore.getState().initializePurchases();
          return;
        }

        const [
          { initDatabase },
          { initReminders, syncScheduledReminders },
          { useSettingsStore },
          { useTaskStore },
          { useListStore },
        ] = await Promise.all([
          import('@/db/migrations'),
          import('@/features/reminders/reminderService'),
          import('@/store/settingsStore'),
          import('@/store/taskStore'),
          import('@/store/listStore'),
        ]);

        await initDatabase();
        await initReminders();
        await useSettingsStore.getState().hydrate();
        await useTaskStore.getState().refreshAll();
        await useListStore.getState().refresh();
        void useProStore.getState().initializePurchases();
        void syncScheduledReminders();
      } catch (error) {
        console.error('Do! bootstrap failed:', error);
      } finally {
        setReady(true);
        await SplashScreen.hideAsync();
      }
    }
    bootstrap();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasBackground = appState.current.match(/inactive|background/);
      appState.current = nextState;

      if (wasBackground && nextState === 'active') {
        void useProStore.getState().refreshProStatus();
        if (Platform.OS !== 'web') {
          void import('@/features/reminders/reminderService').then(
            ({ syncScheduledReminders }) => syncScheduledReminders()
          );
        }
      }
    });

    return () => subscription.remove();
  }, []);

  // Tapping a reminder opens its task; also covers the notification that cold-started the app.
  useEffect(() => {
    if (!ready || Platform.OS === 'web') return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    void import('@/features/reminders/reminderService').then(
      async ({
        addReminderResponseListener,
        getLaunchReminderResponse,
        snoozeReminder,
        SNOOZE_MINUTES,
      }) => {
        const handle = async ({ taskId, action }: ReminderResponse) => {
          const { useTaskStore } = await import('@/store/taskStore');
          const { useToastStore } = await import('@/store/toastStore');

          if (action === 'complete') {
            await useTaskStore.getState().completeTask(taskId);
            return;
          }
          if (action === 'snooze') {
            const until = await snoozeReminder(taskId);
            await useTaskStore.getState().refreshAll();
            if (until) {
              useToastStore
                .getState()
                .show(`Snoozed for ${SNOOZE_MINUTES} minutes`);
            }
            return;
          }
          router.push(`/task/${taskId}`);
        };

        const launch = await getLaunchReminderResponse();
        if (cancelled) return;
        if (launch) await handle(launch);
        if (cancelled) return;
        unsubscribe = await addReminderResponseListener((response) => {
          void handle(response);
        });
        if (cancelled) unsubscribe?.();
      }
    );

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [ready]);

  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: rootBackground }]}>
      <KeyboardProvider>
        <ThemeProvider>
          <ThemedRoot>
            {ready ? <AppNavigator /> : <BootstrapScreen />}
            {ready ? <Toast /> : null}
          </ThemedRoot>
        </ThemeProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
