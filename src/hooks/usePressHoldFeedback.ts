import {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const HOLD_IN_MS = 120;
const HOLD_OUT_MS = 100;
const SCALE_HELD = 0.992;
const OPACITY_HELD = 0.97;

export function usePressHoldFeedback() {
  const active = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(active.value, [0, 1], [1, SCALE_HELD]) }],
    opacity: interpolate(active.value, [0, 1], [1, OPACITY_HELD]),
  }));

  const pressIn = () => {
    active.value = withTiming(1, { duration: HOLD_IN_MS });
  };

  const pressOut = () => {
    active.value = withTiming(0, { duration: HOLD_OUT_MS });
  };

  return { animatedStyle, pressIn, pressOut };
}
