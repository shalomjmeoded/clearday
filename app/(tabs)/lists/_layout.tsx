import { Stack } from 'expo-router';
import { useMemo } from 'react';

import { stackScreenOptions } from '@/navigation/screenOptions';
import { useTheme } from '@/theme/ThemeProvider';

export default function ListsTabLayout() {
  const { tokens } = useTheme();
  const screenOptions = useMemo(() => stackScreenOptions(tokens), [tokens]);

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
