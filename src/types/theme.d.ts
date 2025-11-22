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
    custom?: {
      [key: string]: string;
    };
  }

  interface MD3Typescale {
    mono?: {
      fontFamily: string;
      fontSize?: number;
      fontWeight?: string;
      letterSpacing?: number;
      lineHeight?: number;
    };
  }

  interface MD3Theme {
    custom?: {
      [key: string]: any;
    };
  }
}
