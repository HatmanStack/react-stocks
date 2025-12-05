/**
 * Stock Card Component
 * Displays OHLCV (Open, High, Low, Close, Volume) data for a single stock price entry
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card, useTheme } from 'react-native-paper';
import type { StockDetails } from '@/types/database.types';
import { formatCurrency, formatVolume } from '@/utils/formatting/numberFormatting';
import { formatShortDate } from '@/utils/date/dateUtils';

interface StockCardProps {
  stock: StockDetails;
  onPress?: () => void;
}

export function StockCard({ stock, onPress }: StockCardProps) {
  const theme = useTheme();

  // Determine if stock went up or down
  const isPositive = stock.close >= stock.open;
  const changeColor = isPositive ? theme.colors.positive : theme.colors.negative;

  return (
    <Card style={styles.card} onPress={onPress}>
      <Card.Content>
        <View style={styles.header}>
          <Text style={[styles.date, { color: theme.colors.onSurface }]}>
            {formatShortDate(stock.date)}
          </Text>
          <Text style={[styles.change, { color: changeColor }]}>
            {isPositive ? '▲' : '▼'}
          </Text>
        </View>

        <View style={styles.priceContainer}>
          <View style={styles.priceRow}>
            <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>Open:</Text>
            <Text style={[styles.value, { color: theme.colors.onSurface }]}>
              {formatCurrency(stock.open)}
            </Text>
          </View>

          <View style={styles.priceRow}>
            <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>Close:</Text>
            <Text style={[styles.value, { color: changeColor }]}>
              {formatCurrency(stock.close)}
            </Text>
          </View>
        </View>

        <View style={styles.priceContainer}>
          <View style={styles.priceRow}>
            <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>High:</Text>
            <Text style={[styles.value, { color: theme.colors.onSurface }]}>
              {formatCurrency(stock.high)}
            </Text>
          </View>

          <View style={styles.priceRow}>
            <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>Low:</Text>
            <Text style={[styles.value, { color: theme.colors.onSurface }]}>
              {formatCurrency(stock.low)}
            </Text>
          </View>
        </View>

        <View style={[styles.volumeContainer, { borderTopColor: theme.colors.surfaceVariant }]}>
          <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>Volume:</Text>
          <Text style={[styles.value, { color: theme.colors.onSurface }]}>
            {formatVolume(stock.volume)}
          </Text>
        </View>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginVertical: 4,
    marginHorizontal: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  date: {
    fontSize: 16,
    fontWeight: '600',
  },
  change: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  priceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  priceRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  label: {
    fontSize: 14,
  },
  value: {
    fontSize: 14,
    fontWeight: '500',
  },
  volumeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
  },
});
