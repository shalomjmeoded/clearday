import { Image, StyleSheet, View } from 'react-native';

import {
  SPLASH_BACKGROUND_DARK,
  SPLASH_BACKGROUND_LIGHT,
  SPLASH_ICON_DARK,
  SPLASH_ICON_LIGHT,
  SPLASH_ICON_WIDTH,
} from '@/constants/brandAssets';
import { useTheme } from '@/theme/ThemeProvider';

export function BootstrapScreen() {
  const { isDark } = useTheme();

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: isDark ? SPLASH_BACKGROUND_DARK : SPLASH_BACKGROUND_LIGHT,
        },
      ]}
    >
      <Image
        source={isDark ? SPLASH_ICON_DARK : SPLASH_ICON_LIGHT}
        style={styles.logo}
        resizeMode="contain"
        accessibilityLabel="Do!"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: SPLASH_ICON_WIDTH,
    height: SPLASH_ICON_WIDTH,
  },
});
