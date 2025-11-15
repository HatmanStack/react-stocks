/**
 * Price List Item
 * Displays a single day's OHLCV price data with color coding
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import type { StockDetails } from '@/types/database.types';
import { formatCurrency, formatVolume } from '@/utils/formatting/numberFormatting';
import { formatShortDate } from '@/utils/formatting/dateFormatting';
import { MonoText } from '@/components/common';

interface PriceListItemProps {
  item: StockDetails;
}

export const PriceListItem: React.FC<PriceListItemProps> = React.memo(({ item }) => {
  const theme = useTheme();

  // Determine row color based on close vs open
  const getRowColor = (): string => {
    if (item.close > item.open) {
      return '#E8F5E9'; // Light green (bullish)
    } else if (item.close < item.open) {
      return '#FFEBEE'; // Light red (bearish)
    }
    return '#F5F5F5'; // Light gray (neutral)
  };

  const getTextColor = (): string => {
    if (item.close > item.open) {
      return '#2E7D32'; // Dark green
    } else if (item.close < item.open) {
      return '#C62828'; // Dark red
    }
    return theme.colors.onSurface;
  };

  const textColor = getTextColor();

  return (
    <View style={[styles.container, { backgroundColor: getRowColor() }]}>
      <View style={styles.row}>
        {/* Date */}
        <View style={styles.dateColumn}>
          <Text variant="bodyMedium" style={[styles.text, { color: textColor }]}>
            {formatShortDate(item.date)}
          </Text>
        </View>

        {/* OHLC Prices */}
        <View style={styles.priceColumn}>
          <MonoText
            variant="price"
            style={[styles.text, { color: textColor }]}
            positive={item.close > item.open}
            negative={item.close < item.open}
          >
            {formatCurrency(item.open)}
          </MonoText>
        </View>

        <View style={styles.priceColumn}>
          <MonoText
            variant="price"
            style={[styles.text, { color: textColor, fontWeight: 'bold' }]}
            positive={item.close > item.open}
            negative={item.close < item.open}
          >
            {formatCurrency(item.close)}
          </MonoText>
        </View>

        <View style={styles.priceColumn}>
          <MonoText
            variant="price"
            style={[styles.text, { color: textColor }]}
            positive={item.close > item.open}
            negative={item.close < item.open}
          >
            {formatCurrency(item.high)}
          </MonoText>
        </View>

        <View style={styles.priceColumn}>
          <MonoText
            variant="price"
            style={[styles.text, { color: textColor }]}
            positive={item.close > item.open}
            negative={item.close < item.open}
          >
            {formatCurrency(item.low)}
          </MonoText>
        </View>

        {/* Volume */}
        <View style={styles.volumeColumn}>
          <MonoText
            variant="volume"
            style={[styles.text, { color: textColor }]}
          >
            {formatVolume(item.volume)}
          </MonoText>
        </View>
      </View>
    </View>
  );
});

PriceListItem.displayName = 'PriceListItem';

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateColumn: {
    flex: 1.5,
    minWidth: 55,
  },
  priceColumn: {
    flex: 1,
    alignItems: 'flex-end',
    minWidth: 55,
  },
  volumeColumn: {
    flex: 1,
    alignItems: 'flex-end',
    minWidth: 50,
  },
  text: {
    fontSize: 12,
  },
});
