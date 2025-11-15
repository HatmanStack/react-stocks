/**
 * Theme Type Augmentation
 * Extends React Native Paper types with custom theme properties
 */

import 'react-native-paper';

declare module 'react-native-paper' {
  interface MD3Colors {
    positive: string;
    negative: string;
    neutral: string;
  }

  interface ThemeFonts {
    mono: string;
  }
}
