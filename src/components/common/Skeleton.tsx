/**
 * Skeleton Component
 * Placeholder box for loading states
 */

import React from 'react';
import { View, ViewProps } from 'react-native';
import { useTheme } from 'react-native-paper';

export interface SkeletonProps extends ViewProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
}

export function Skeleton({
  width = '100%',
  height = 20,
  borderRadius = 4,
  style,
  ...props
}: SkeletonProps) {
  const theme = useTheme();

  return (
    <View
      {...props}
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: theme.colors.surfaceVariant,
        },
        style,
      ]}
    />
  );
}
