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
    mono: {
      fontFamily: string;
      fontWeight: string;
      fontSize: number;
      lineHeight: number;
      letterSpacing: number;
    };
  }

  interface MD3Theme {
    custom: {
      colors: any;
      typography: any;
      spacing: any;
      borderRadius: any;
      shadows: any;
    };
  }
}
