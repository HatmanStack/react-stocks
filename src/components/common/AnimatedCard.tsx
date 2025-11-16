/**
 * AnimatedCard Component
 *
 * Wrapper around React Native Paper Card with press animation
 * Provides subtle scale animation on press for better user feedback
 */

import React, { useState } from 'react';
import { Pressable, Platform } from 'react-native';
import { Card, CardProps, useTheme } from 'react-native-paper';
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
 * AnimatedCard provides press feedback animation and web hover states
 * Scale: 1.0 (rest) → 0.98 (pressed)
 * Duration: 150ms with spring physics
 * Web: Adds hover state with subtle opacity change and cursor pointer
 */
export function AnimatedCard({
  onPress,
  children,
  style,
  ...props
}: AnimatedCardProps) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const [isHovered, setIsHovered] = useState(false);

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

  const handleMouseEnter = () => {
    if (Platform.OS === 'web') {
      setIsHovered(true);
    }
  };

  const handleMouseLeave = () => {
    if (Platform.OS === 'web') {
      setIsHovered(false);
    }
  };

  // Web-specific hover styles
  const hoverStyle = Platform.OS === 'web' && isHovered && onPress ? {
    opacity: 0.92,
    cursor: 'pointer' as const,
  } : {};

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      disabled={!onPress}
      // @ts-ignore - Web-only props
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Animated.View style={[animatedStyle, hoverStyle, style]}>
        <Card {...props}>
          {children}
        </Card>
      </Animated.View>
    </Pressable>
  );
}
