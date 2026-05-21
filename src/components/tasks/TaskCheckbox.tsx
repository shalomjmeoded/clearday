import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme/ThemeProvider';
import type { TaskPriority } from '@/types/task';

interface Props {
  checked: boolean;
  priority: TaskPriority;
  onPress: () => void;
}

const SPRING = { damping: 14, stiffness: 220 };

export function TaskCheckbox({ checked, priority, onPress }: Props) {
  const { tokens } = useTheme();
  const scale = useSharedValue(1);
  const progress = useSharedValue(checked ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(checked ? 1 : 0, { duration: 200 });
  }, [checked, progress]);

  const boxStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    borderColor:
      progress.value > 0.5
        ? tokens.checkboxFill
        : priority === 'important' || priority === 'must_do_today'
          ? tokens.accent
          : tokens.border,
  }));

  const fillStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const checkStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.5, 1]) }],
  }));

  const handlePress = () => {
    scale.value = withSpring(0.88, SPRING, () => {
      scale.value = withSpring(1, SPRING);
    });
    onPress();
  };

  const showDot = priority === 'important' && !checked;

  return (
    <Pressable onPress={handlePress} hitSlop={14} style={styles.hit}>
      <Animated.View style={[styles.box, boxStyle]}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            styles.fill,
            { backgroundColor: tokens.checkboxFill },
            fillStyle,
          ]}
        />
        <Animated.View style={checkStyle}>
          <Ionicons name="checkmark" size={16} color={tokens.onAccent} />
        </Animated.View>
        {showDot && (
          <View style={[styles.dot, { backgroundColor: tokens.accent }]} />
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { marginTop: 1 },
  box: {
    width: 30,
    height: 30,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: { borderRadius: 4 },
  dot: {
    position: 'absolute',
    right: -3,
    top: -3,
    width: 7,
    height: 7,
    borderRadius: 99,
  },
});
