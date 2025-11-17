/**
 * Stock Metadata Card
 * Displays company information at the top of the Price screen
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, useTheme } from 'react-native-paper';
import type { SymbolDetails } from '@/types/database.types';

interface StockMetadataCardProps {
  symbol: SymbolDetails | null;
  isLoading?: boolean;
}

export const StockMetadataCard: React.FC<StockMetadataCardProps> = ({
  symbol,
  isLoading,
}) => {
  const theme = useTheme();

  if (isLoading) {
    return (
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleLarge">Loading...</Text>
        </Card.Content>
      </Card>
    );
  }

  if (!symbol) {
    return (
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleLarge">Symbol not found</Text>
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <Card.Content style={styles.content}>
        <View style={styles.leftSection}>
          <View style={styles.header}>
            <Text variant="headlineSmall" style={styles.ticker}>
              {symbol.ticker}
            </Text>
            <Text variant="bodyMedium" style={[styles.exchange, { color: theme.colors.secondary }]}>
              {symbol.exchangeCode}
            </Text>
          </View>

          <Text variant="titleMedium" style={styles.name}>
            {symbol.name}
          </Text>
        </View>

        {symbol.longDescription && (
          <View style={styles.rightSection}>
            <Text
              variant="bodySmall"
              style={[styles.description, { color: theme.colors.onSurfaceVariant }]}
              numberOfLines={4}
            >
              {symbol.longDescription}
            </Text>
          </View>
        )}
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginVertical: 8,
  },
  content: {
    flexDirection: 'row',
    gap: 12,
  },
  leftSection: {
    flex: 1,
    minWidth: 140,
  },
  rightSection: {
    flex: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  ticker: {
    fontWeight: 'bold',
    marginRight: 8,
    fontSize: 20,
  },
  exchange: {
    fontSize: 12,
    textTransform: 'uppercase',
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
  },
  description: {
    lineHeight: 18,
    fontSize: 13,
  },
});
