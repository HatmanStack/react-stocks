import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

/**
 * Interface defining layout density configuration
 */
export interface LayoutDensity {
  isDense: boolean;
  cardSpacing: number;
  cardPadding: number;
  fontSize: {
    title: number;
    subtitle: number;
    caption: number;
  };
}

/**
 * Hook to determine layout density based on screen size
 *
 * Context-dependent density:
 * - Dense layout for mobile/narrow screens (< 768px)
 * - Spacious layout for tablet/desktop (>= 768px)
 *
 * @returns LayoutDensity configuration object
 */
export function useLayoutDensity(): LayoutDensity {
  const { width } = useWindowDimensions();

  return useMemo(() => {
    // Dense layout for narrower screens, spacious for wider
    const isDense = width < 768; // tablet breakpoint

    return {
      isDense,
      cardSpacing: isDense ? 6 : 12,
      cardPadding: isDense ? 12 : 16,
      fontSize: {
        title: isDense ? 14 : 16,
        subtitle: isDense ? 12 : 14,
        caption: isDense ? 10 : 12,
      },
    };
  }, [width]);
}
