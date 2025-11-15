/**
 * Dark Color Palette
 * Material Design 3 dark theme with financial-focused semantics
 */

export const colors = {
  // Primary colors (blue - good contrast on dark)
  primary: '#2196F3',
  primaryLight: '#64B5F6',
  primaryDark: '#1976D2',

  // Secondary colors (darker grays for dark theme)
  secondary: '#757575',
  secondaryLight: '#9E9E9E',
  secondaryDark: '#424242',

  // Sentiment colors (adjusted for dark background contrast)
  positive: '#4CAF50',
  positiveLight: '#81C784',
  positiveDark: '#388E3C',

  negative: '#F44336',
  negativeLight: '#E57373',
  negativeDark: '#D32F2F',

  neutral: '#9E9E9E',
  neutralLight: '#BDBDBD',
  neutralDark: '#616161',

  // Background colors (Material Design 3 dark baseline)
  background: '#121212',
  backgroundSecondary: '#1e1e1e',
  backgroundTertiary: '#2c2c2c',

  // Surface colors (slightly lighter than background)
  surface: '#1e1e1e',
  surfaceVariant: '#2c2c2c',

  // Text colors (high contrast on dark backgrounds)
  text: '#FFFFFF',
  textSecondary: '#B3B3B3',
  textTertiary: '#808080',
  textInverse: '#000000',

  // Border colors (subtle on dark)
  border: '#424242',
  borderLight: '#2c2c2c',
  borderDark: '#616161',

  // Status colors (same as sentiment for consistency)
  success: '#4CAF50',
  warning: '#FF9800',
  error: '#F44336',
  info: '#2196F3',

  // Overlay colors (lighter overlays for dark theme)
  overlay: 'rgba(0, 0, 0, 0.7)',
  overlayLight: 'rgba(0, 0, 0, 0.5)',
  overlayDark: 'rgba(0, 0, 0, 0.9)',

  // Transparent
  transparent: 'transparent',
};

export type ColorName = keyof typeof colors;
