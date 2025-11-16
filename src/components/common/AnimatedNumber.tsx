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
  useDerivedValue,
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
  }, [value]);

  const animatedProps = useAnimatedProps(() => {
    // Format the animated value
    const formattedValue = formatter(animatedValue.value);
    return {
      text: formattedValue,
    } as any;
  });

  return (
    <AnimatedMonoText
      {...props}
      animatedProps={animatedProps}
      variant={variant}
      positive={positive}
      negative={negative}
      style={style}
    >
      {/* Fallback text (won't be visible due to animatedProps) */}
      {formatter(value)}
    </AnimatedMonoText>
  );
}
