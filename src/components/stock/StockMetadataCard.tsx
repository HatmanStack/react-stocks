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
      <Card.Content>
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

        {symbol.longDescription && (
          <Text
            variant="bodyMedium"
            style={[styles.description, { color: theme.colors.onSurfaceVariant }]}
            numberOfLines={3}
          >
            {symbol.longDescription}
          </Text>
        )}
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    margin: 16, // More spacious margins
    marginBottom: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12, // More spacing
  },
  ticker: {
    fontWeight: 'bold',
    marginRight: 12,
    fontSize: 24, // Larger ticker
  },
  exchange: {
    fontSize: 14, // Slightly larger exchange
    textTransform: 'uppercase',
  },
  name: {
    marginBottom: 12, // More spacing
    fontSize: 18, // Larger company name
  },
  description: {
    lineHeight: 24, // More generous line height
  },
});
