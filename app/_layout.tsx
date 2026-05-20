import { ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import 'react-native-reanimated';

import { BootstrapScreen } from '@/components/layout/BootstrapScreen';
import { ThemedRoot } from '@/components/layout/ThemedRoot';
import { initDatabase } from '@/db/migrations';
import { initReminders } from '@/features/reminders/reminderService';
import {
  fullScreenModalOptions,
  modalScreenOptions,
  stackScreenOptions,
} from '@/navigation/screenOptions';
import { useListStore } from '@/store/listStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTaskStore } from '@/store/taskStore';
import { buildNavigationTheme } from '@/theme/navigationTheme';
import { lightTheme } from '@/theme/tokens';
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
  const proModalOpts = useMemo(() => modalScreenOptions(tokens, 'ClearDay Pro'), [tokens]);
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
        <Stack.Screen name="lists/[listId]" />
      </Stack>
    </NavigationThemeProvider>
  );
}

function RootShell({ ready }: { ready: boolean }) {
  return (
    <ThemedRoot>
      {ready ? <AppNavigator /> : <BootstrapScreen />}
    </ThemedRoot>
  );
}

export default function RootLayout() {
  const [hydrated, setHydrated] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function bootstrap() {
      try {
        await initDatabase();
        await initReminders();
        await useSettingsStore.getState().hydrate();
        setHydrated(true);
        await useTaskStore.getState().refreshAll();
        await useListStore.getState().refresh();
      } catch (error) {
        console.error('ClearDay bootstrap failed:', error);
        setHydrated(true);
      } finally {
        setReady(true);
        await SplashScreen.hideAsync();
      }
    }
    bootstrap();
  }, []);

  if (!hydrated) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <KeyboardProvider>
        <ThemeProvider>
          <RootShell ready={ready} />
        </ThemeProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: lightTheme.background,
  },
});
