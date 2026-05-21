import { Platform, TextStyle } from 'react-native';

const fontFamily = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
});

const displayFamily = Platform.select({
  ios: 'AvenirNext-Regular',
  android: 'sans-serif',
  default: 'Avenir Next, Inter, system-ui, sans-serif',
});

export const typography = {
  heroTitle: {
    fontFamily: displayFamily,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '400' as TextStyle['fontWeight'],
    letterSpacing: 0,
  },
  screenTitle: {
    fontFamily: displayFamily,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '400' as TextStyle['fontWeight'],
    letterSpacing: 0,
  },
  taskTitle: {
    fontFamily: displayFamily,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '400' as TextStyle['fontWeight'],
    letterSpacing: 0,
  },
  taskTitleCompleted: {
    fontFamily: displayFamily,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '400' as TextStyle['fontWeight'],
    letterSpacing: 0,
  },
  meta: {
    fontFamily: displayFamily,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500' as TextStyle['fontWeight'],
    letterSpacing: 0,
  },
  caption: {
    fontFamily: displayFamily,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '400' as TextStyle['fontWeight'],
    letterSpacing: 0,
    textTransform: 'uppercase' as TextStyle['textTransform'],
  },
  body: {
    fontFamily: displayFamily,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '400' as TextStyle['fontWeight'],
  },
  button: {
    fontFamily: displayFamily,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600' as TextStyle['fontWeight'],
  },
  empty: {
    fontFamily,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '400' as TextStyle['fontWeight'],
    letterSpacing: 0,
  },
  emptySub: {
    fontFamily,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '400' as TextStyle['fontWeight'],
  },
} as const;
