import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  TAB_BAR_PADDING_TOP,
  getTabBarHeight,
} from '@/constants/layout';
import { useTheme } from '@/theme/ThemeProvider';

export default function TabLayout() {
  const { tokens } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const tabBarHeight = getTabBarHeight(bottom);

  const screenOptions = useMemo(
    () => ({
      headerShown: false,
      // The tab bar stays in place; the keyboard simply covers it and the
      // sticky input bar travels up over it. Hiding the bar used to resize
      // the scene mid-animation, which made the input bar jump.
      lazy: false,
      sceneStyle: { backgroundColor: tokens.background },
      tabBarActiveTintColor: tokens.accent,
      tabBarInactiveTintColor: tokens.mutedText,
      tabBarStyle: {
        backgroundColor: tokens.tabBar,
        borderTopColor: tokens.border,
        borderTopWidth: StyleSheet.hairlineWidth,
        height: tabBarHeight,
        paddingTop: TAB_BAR_PADDING_TOP,
        paddingBottom: bottom,
      },
      tabBarLabelStyle: {
        fontSize: 11,
        fontWeight: '500' as const,
        letterSpacing: 0.2,
      },
    }),
    [tokens, tabBarHeight, bottom]
  );

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'sunny' : 'sunny-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Schedule',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="lists"
        options={{
          title: 'Lists',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'folder' : 'folder-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="ellipsis-horizontal" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
