/**
 * Stock Metadata Card
 * Displays company information at the top of the Price screen
 */

import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
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
  const [isExpanded, setIsExpanded] = useState(false);

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
          <View>
            <Text
              variant="bodyMedium"
              style={[styles.description, { color: theme.colors.onSurfaceVariant }]}
              numberOfLines={isExpanded ? undefined : 4}
            >
              {symbol.longDescription}
            </Text>
            <TouchableOpacity
              onPress={() => setIsExpanded(!isExpanded)}
              style={styles.moreButton}
            >
              <Text variant="bodySmall" style={[styles.moreText, { color: theme.colors.primary }]}>
                {isExpanded ? 'Show less' : 'Show more'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    margin: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  ticker: {
    fontWeight: 'bold',
    marginRight: 12,
    fontSize: 22,
  },
  exchange: {
    fontSize: 13,
    textTransform: 'uppercase',
  },
  name: {
    marginBottom: 8,
    fontSize: 16,
    fontWeight: '600',
  },
  description: {
    lineHeight: 20,
  },
  moreButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  moreText: {
    fontWeight: '600',
  },
});
