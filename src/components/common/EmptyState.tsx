/**
 * Empty State Component
 * Displays when lists have no data
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from 'react-native-paper';

interface EmptyStateProps {
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
  description?: string;
}

export function EmptyState({
  message,
  icon = 'file-tray-outline',
  description
}: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={64} color={theme.colors.onSurfaceVariant} />
      <Text style={[styles.message, { color: theme.colors.onSurface }]}>{message}</Text>
      {description && <Text style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>{description}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  message: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
});
