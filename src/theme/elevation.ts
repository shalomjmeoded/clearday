import type { ViewStyle } from 'react-native';

/** Shared shadow levels so surfaces lift consistently across the app. */
export const elevation = {
  /** Subtle lift for selected segments and small raised chips. */
  raised: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  } as ViewStyle,
  /** Input bars and other surfaces that float over content. */
  floating: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  } as ViewStyle,
  /** Toasts and transient overlays above everything else. */
  overlay: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  } as ViewStyle,
} as const;
