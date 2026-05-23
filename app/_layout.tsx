import { ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, useColorScheme } from 'react-native';
import 'react-native-reanimated';

import { BootstrapScreen } from '@/components/layout/BootstrapScreen';
import { ThemedRoot } from '@/components/layout/ThemedRoot';
import {
  SPLASH_BACKGROUND_DARK,
  SPLASH_BACKGROUND_LIGHT,
} from '@/constants/brandAssets';
import { initDatabase } from '@/db/migrations';
import { initReminders } from '@/features/reminders/reminderService';
import {
  fullScreenModalOptions,
  modalScreenOptions,
  stackScreenOptions,
} from '@/navigation/screenOptions';
import { useListStore } from '@/store/listStore';
import { useProStore } from '@/store/proStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTaskStore } from '@/store/taskStore';
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
        await initDatabase();
        await initReminders();
        await useSettingsStore.getState().hydrate();
        await useTaskStore.getState().refreshAll();
        await useListStore.getState().refresh();
        void useProStore.getState().initializePurchases();
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
      }
    });

    return () => subscription.remove();
  }, []);

  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: rootBackground }]}>
      <KeyboardProvider>
        <ThemeProvider>
          <ThemedRoot>
            {ready ? <AppNavigator /> : <BootstrapScreen />}
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
