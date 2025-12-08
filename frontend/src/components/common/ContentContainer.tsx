/**
 * ContentContainer
 * A responsive container that constrains content width:
 * - Small screens (<600px): nearly full width with small margins
 * - Larger screens: 66% width, centered
 */

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useContentWidth } from '@/hooks/useContentWidth';

interface ContentContainerProps {
  children: React.ReactNode;
  style?: ViewStyle;
  /** If true, don't apply width constraints (useful for full-width backgrounds) */
  fullWidth?: boolean;
}

export function ContentContainer({ children, style, fullWidth = false }: ContentContainerProps) {
  const { contentWidth } = useContentWidth();

  if (fullWidth) {
    return <View style={[styles.container, style]}>{children}</View>;
  }

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.content, { width: contentWidth }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
});
