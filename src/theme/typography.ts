import { Platform, TextStyle } from 'react-native';

const fontFamily = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
});

export const typography = {
  heroTitle: {
    fontFamily,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '600' as TextStyle['fontWeight'],
    letterSpacing: -0.8,
  },
  screenTitle: {
    fontFamily,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '600' as TextStyle['fontWeight'],
    letterSpacing: -0.5,
  },
  taskTitle: {
    fontFamily,
    fontSize: 19,
    lineHeight: 26,
    fontWeight: '400' as TextStyle['fontWeight'],
    letterSpacing: -0.2,
  },
  taskTitleCompleted: {
    fontFamily,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '400' as TextStyle['fontWeight'],
  },
  meta: {
    fontFamily,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500' as TextStyle['fontWeight'],
    letterSpacing: 0.2,
  },
  caption: {
    fontFamily,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500' as TextStyle['fontWeight'],
    letterSpacing: 0.6,
    textTransform: 'uppercase' as TextStyle['textTransform'],
  },
  body: {
    fontFamily,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '400' as TextStyle['fontWeight'],
  },
  button: {
    fontFamily,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600' as TextStyle['fontWeight'],
  },
  empty: {
    fontFamily,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '400' as TextStyle['fontWeight'],
    letterSpacing: -0.2,
  },
  emptySub: {
    fontFamily,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '400' as TextStyle['fontWeight'],
  },
} as const;
