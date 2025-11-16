/**
 * AnimatedCard Component
 *
 * Wrapper around React Native Paper Card with press animation
 * Provides subtle scale animation on press for better user feedback
 */

import React from 'react';
import { Pressable } from 'react-native';
import { Card, CardProps } from 'react-native-paper';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

export interface AnimatedCardProps extends Omit<CardProps, 'onPress'> {
  onPress?: () => void;
  children: React.ReactNode;
}

/**
 * AnimatedCard provides press feedback animation
 * Scale: 1.0 (rest) → 0.98 (pressed)
 * Duration: 150ms with spring physics
 */
export function AnimatedCard({
  onPress,
  children,
  style,
  ...props
}: AnimatedCardProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.98, {
      damping: 15,
      stiffness: 150,
    });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, {
      damping: 15,
      stiffness: 150,
    });
  };

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      disabled={!onPress}
    >
      <Animated.View style={[animatedStyle, style]}>
        <Card {...props}>
          {children}
        </Card>
      </Animated.View>
    </Pressable>
  );
}
