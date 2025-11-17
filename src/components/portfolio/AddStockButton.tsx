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

  return (
    <FAB
      icon="plus"
      label="Add Stock"
      onPress={onPress}
      style={[styles.fab, { backgroundColor: theme.colors.primary }]}
      accessibilityLabel="Add stock to portfolio"
      accessibilityHint="Opens search screen to select a stock to add to your portfolio"
    />
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
