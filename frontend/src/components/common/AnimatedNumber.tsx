/**
 * AnimatedNumber Component
 *
 * Animates number value changes with spring physics
 * Integrates with MonoText for consistent monospaced display
 */

import React, { useEffect } from 'react';
import { TextProps } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withSpring,
} from 'react-native-reanimated';
import { MonoText } from './MonoText';

const AnimatedMonoText = Animated.createAnimatedComponent(MonoText);

export interface AnimatedNumberProps extends Omit<TextProps, 'children'> {
  value: number;
  formatter?: (value: number) => string;
  positive?: boolean;
  negative?: boolean;
  variant?: 'price' | 'percentage' | 'volume';
}

/**
 * AnimatedNumber smoothly transitions between number values
 * Uses spring animation for natural feel
 * Inherits MonoText styling for financial data
 */
export function AnimatedNumber({
  value,
  formatter = (v) => v.toFixed(2),
  positive,
  negative,
  variant,
  style,
  ...props
}: AnimatedNumberProps) {
  const animatedValue = useSharedValue(value);

  useEffect(() => {
    animatedValue.value = withSpring(value, {
      damping: 15,
      stiffness: 100,
      mass: 0.5,
    });
  }, [value, animatedValue]);

  const animatedProps = useAnimatedProps(() => {
    const formattedValue = formatter(animatedValue.value);
    return {
      text: formattedValue,
      // Reanimated's AnimatedProps type doesn't include 'text' for custom components.
      // This is a known gap — the prop is correctly applied at runtime.
    } as unknown as Record<string, unknown>;
  });

  return (
    <AnimatedMonoText
      {...props}
      animatedProps={animatedProps}
      variant={variant}
      positive={positive}
      negative={negative}
      style={style}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={formatter(value)}
    >
      {/* Fallback text (won't be visible due to animatedProps) */}
      {formatter(value)}
    </AnimatedMonoText>
  );
}
