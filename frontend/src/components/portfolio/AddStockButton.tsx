/**
 * Add Stock Button Component
 * Floating action button to add stocks to portfolio
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import { FAB, useTheme } from 'react-native-paper';
import { useContentWidth } from '@/hooks/useContentWidth';

interface AddStockButtonProps {
  onPress: () => void;
}

export function AddStockButton({ onPress }: AddStockButtonProps) {
  const theme = useTheme();
  const { contentWidth, screenWidth } = useContentWidth();
  const horizontalOffset = (screenWidth - contentWidth) / 2;

  return (
    <FAB
      icon="plus"
      label="Add Stock"
      onPress={onPress}
      style={[styles.fab, { backgroundColor: theme.colors.primary, right: horizontalOffset }]}
      accessibilityLabel="Add stock to portfolio"
      accessibilityHint="Opens search screen to select a stock to add to your portfolio"
    />
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    margin: 16,
    bottom: 0,
  },
});
