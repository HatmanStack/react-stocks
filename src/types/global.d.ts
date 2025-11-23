import 'react-native-paper';

declare global {
  namespace ReactNativePaper {
    interface MD3Colors {
      positive: string;
      negative: string;
      neutral: string;
    }
    interface ThemeFonts {
      mono: any;
    }
  }
}
