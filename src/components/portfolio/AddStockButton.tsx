/**
 * Add Stock Button Component
 * Floating action button to add stocks to portfolio
 */

import React, { useState } from 'react';
import { StyleSheet, Pressable, Platform } from 'react-native';
import { FAB, useTheme } from 'react-native-paper';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

interface AddStockButtonProps {
  onPress: () => void;
}

export function AddStockButton({ onPress }: AddStockButtonProps) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const [isHovered, setIsHovered] = useState(false);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95, { damping: 15 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15 });
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
  const hoverStyle = Platform.OS === 'web' && isHovered ? {
    opacity: 0.9,
    cursor: 'pointer' as const,
  } : {};

  return (
    <Animated.View style={[styles.fab, { backgroundColor: theme.colors.primary }, animatedStyle, hoverStyle]}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        // @ts-ignore - Web-only props
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <FAB
          icon="plus"
          onPress={() => {}} // Handled by Pressable wrapper
          label="Add Stock"
          accessibilityLabel="Add stock to portfolio"
          accessibilityHint="Opens search screen to select a stock to add to your portfolio"
          accessibilityRole="button"
        />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
});
