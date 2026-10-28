import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';

// 36pt buttons + 4pt slop each side = 44pt targets; the slop stays at half
// the 8pt gap between Clear and Close, so the two hit rects never overlap.
const ICON_HIT_SLOP = { top: 8, bottom: 8, left: 4, right: 4 };

interface ToggleProps {
  open: boolean;
  onPress: () => void;
  /** Names what is searched, e.g. "Search finished tasks". */
  label: string;
  color?: string;
}

/**
 * The header icon that opens and closes a screen's SearchBar. One glyph in
 * the same spot on every screen, so search costs no chrome until wanted.
 */
export function SearchToggle({ open, onPress, label, color }: ToggleProps) {
  const { tokens } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: open }}
      style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
    >
      <Ionicons name="search-outline" size={19} color={color ?? tokens.text} />
    </Pressable>
  );
}

interface Props {
  value: string;
  onChangeText: (value: string) => void;
  /** Collapses the bar. The icon that opened it is the only other way back. */
  onClose: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * The one search field. Sits under a screen's header in a soft pill, with a
 * clear button that appears once there is text and a chevron to put the bar
 * away. Lives behind a header icon on every screen so an empty screen
 * carries no extra chrome.
 */
export function SearchBar({
  value,
  onChangeText,
  onClose,
  placeholder = 'Search',
  autoFocus = true,
}: Props) {
  const { tokens } = useTheme();

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.box,
          { borderColor: tokens.border, backgroundColor: tokens.sectionBg },
        ]}
      >
        <Ionicons name="search-outline" size={16} color={tokens.mutedText} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          autoFocus={autoFocus}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="never"
          placeholder={placeholder}
          placeholderTextColor={tokens.mutedText}
          accessibilityLabel={placeholder}
          style={[typography.body, styles.input, { color: tokens.text }]}
        />
        {value ? (
          <Pressable
            onPress={() => onChangeText('')}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={ICON_HIT_SLOP}
          >
            <Ionicons name="close-circle" size={17} color={tokens.mutedText} />
          </Pressable>
        ) : null}
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Close search"
          hitSlop={ICON_HIT_SLOP}
        >
          <Ionicons name="chevron-up" size={18} color={tokens.mutedText} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  box: {
    minHeight: 38,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: {
    paddingVertical: spacing.xs,
    paddingHorizontal: 0,
    fontSize: 16,
    flex: 1,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggle: {
    minWidth: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
