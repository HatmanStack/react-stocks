import 'react-native-paper';

declare module 'react-native-paper' {
  interface MD3Colors {
    positive: string;
    negative: string;
    neutral: string;
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
      colors: {
        primary: string;
        primaryLight: string;
        primaryDark: string;
        secondary: string;
        secondaryLight: string;
        secondaryDark: string;
        background: string;
        surface: string;
        surfaceVariant: string;
        error: string;
        text: string;
        textSecondary: string;
        textInverse: string;
        border: string;
        positive: string;
        negative: string;
        neutral: string;
      };
      typography: {
        fonts: {
          regular: string;
          medium: string;
          bold: string;
          mono: string;
        };
        sizes: {
          xs: number;
          sm: number;
          md: number;
          lg: number;
          xl: number;
          xxl: number;
        };
      };
      spacing: {
        xs: number;
        sm: number;
        md: number;
        lg: number;
        xl: number;
        xxl: number;
      };
      borderRadius: {
        sm: number;
        md: number;
        lg: number;
        xl: number;
        full: number;
      };
      shadows: {
        sm: {
          shadowColor: string;
          shadowOffset: { width: number; height: number };
          shadowOpacity: number;
          shadowRadius: number;
          elevation: number;
        };
        md: {
          shadowColor: string;
          shadowOffset: { width: number; height: number };
          shadowOpacity: number;
          shadowRadius: number;
          elevation: number;
        };
        lg: {
          shadowColor: string;
          shadowOffset: { width: number; height: number };
          shadowOpacity: number;
          shadowRadius: number;
          elevation: number;
        };
      };
    };
  }
}

