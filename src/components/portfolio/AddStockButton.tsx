/**
 * Add Stock Button Component
 * Floating action button to add stocks to portfolio
 */

import React from 'react';
import { StyleSheet, Pressable } from 'react-native';
import { FAB } from 'react-native-paper';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

interface AddStockButtonProps {
  onPress: () => void;
}

export function AddStockButton({ onPress }: AddStockButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95, { damping: 15 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15 });
  };

  return (
    <Animated.View style={[styles.fab, animatedStyle]}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
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
    backgroundColor: '#1976D2',
  },
});
