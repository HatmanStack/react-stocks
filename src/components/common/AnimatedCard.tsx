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
 * AnimatedCard provides press feedback animation, web hover states, and keyboard navigation
 * Scale: 1.0 (rest) → 0.98 (pressed)
 * Duration: 150ms with spring physics
 * Web: Adds hover state with subtle opacity change and cursor pointer
 * Web: Adds focus indicator for keyboard navigation
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
  const [isFocused, setIsFocused] = useState(false);

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

  const handleFocus = () => {
    if (Platform.OS === 'web') {
      setIsFocused(true);
    }
  };

  const handleBlur = () => {
    if (Platform.OS === 'web') {
      setIsFocused(false);
    }
  };

  // Web-specific hover styles
  const hoverStyle = Platform.OS === 'web' && isHovered && onPress ? {
    opacity: 0.92,
    cursor: 'pointer' as const,
  } : {};

  // Web-specific focus styles
  const focusStyle = Platform.OS === 'web' && isFocused && onPress ? {
    outline: `2px solid ${theme.colors.primary}`,
    outlineOffset: 2,
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
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      <Animated.View style={[animatedStyle, hoverStyle, focusStyle, style]}>
        <Card {...props}>
          {children}
        </Card>
      </Animated.View>
    </Pressable>
  );
}
