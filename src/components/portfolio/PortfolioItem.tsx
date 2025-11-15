/**
 * Portfolio Item Component
 * Displays a stock in the portfolio with predictions and color coding
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Card, IconButton, useTheme } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import type { PortfolioDetails } from '@/types/database.types';
import { MonoText } from '@/components/common';
import { formatPercentage } from '@/utils/formatting';

interface PortfolioItemProps {
  item: PortfolioDetails;
  onPress: () => void;
  onDelete: () => void;
}

export function PortfolioItem({ item, onPress, onDelete }: PortfolioItemProps) {
  const theme = useTheme();

  const parseValue = (value: string | number): number | null => {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(numValue) ? null : numValue;
  };

  const formatPredictionValue = (value: string | number): string => {
    const numValue = parseValue(value);
    if (numValue === null) return 'N/A';
    // Divide by 100 since stored values are percentages (5.25), but formatPercentage expects decimals (0.0525)
    return formatPercentage(numValue / 100);
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityLabel={`${item.ticker}, ${item.name || 'Stock'}. Predictions: 1 day ${formatPredictionValue(item.next)}, 2 weeks ${formatPredictionValue(item.wks)}, 1 month ${formatPredictionValue(item.mnth)}`}
      accessibilityHint="Double tap to view stock details"
      accessibilityRole="button"
    >
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.container}>
            <View style={styles.leftContent}>
              <View style={styles.headerRow}>
                <Text style={[styles.ticker, { color: theme.colors.primary }]} allowFontScaling={true}>
                  {item.ticker}
                </Text>
                <IconButton
                  icon="close-circle"
                  size={20}
                  iconColor="#9E9E9E"
                  onPress={onDelete}
                  style={styles.deleteButton}
                  accessibilityLabel={`Remove ${item.ticker} from portfolio`}
                  accessibilityHint="Double tap to remove this stock from your portfolio"
                  accessibilityRole="button"
                />
              </View>
              {item.name && (
                <Text style={[styles.name, { color: theme.colors.onSurface }]} numberOfLines={1} allowFontScaling={true}>
                  {item.name}
                </Text>
              )}
              <View style={styles.predictionsContainer}>
                <View style={styles.predictionItem}>
                  <Text style={[styles.predictionLabel, { color: theme.colors.onSurfaceVariant }]} allowFontScaling={true}>
                    1 Day
                  </Text>
                  <MonoText
                    variant="percentage"
                    positive={parseValue(item.next) !== null && parseValue(item.next)! >= 0}
                    negative={parseValue(item.next) !== null && parseValue(item.next)! < 0}
                    style={styles.predictionValue}
                    allowFontScaling={true}
                  >
                    {formatPredictionValue(item.next)}
                  </MonoText>
                </View>
                <View style={styles.predictionItem}>
                  <Text style={[styles.predictionLabel, { color: theme.colors.onSurfaceVariant }]} allowFontScaling={true}>
                    2 Weeks
                  </Text>
                  <MonoText
                    variant="percentage"
                    positive={parseValue(item.wks) !== null && parseValue(item.wks)! >= 0}
                    negative={parseValue(item.wks) !== null && parseValue(item.wks)! < 0}
                    style={styles.predictionValue}
                    allowFontScaling={true}
                  >
                    {formatPredictionValue(item.wks)}
                  </MonoText>
                </View>
                <View style={styles.predictionItem}>
                  <Text style={[styles.predictionLabel, { color: theme.colors.onSurfaceVariant }]} allowFontScaling={true}>
                    1 Month
                  </Text>
                  <MonoText
                    variant="percentage"
                    positive={parseValue(item.mnth) !== null && parseValue(item.mnth)! >= 0}
                    negative={parseValue(item.mnth) !== null && parseValue(item.mnth)! < 0}
                    style={styles.predictionValue}
                    allowFontScaling={true}
                  >
                    {formatPredictionValue(item.mnth)}
                  </MonoText>
                </View>
              </View>
            </View>
          </View>
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginVertical: 4,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leftContent: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  ticker: {
    fontSize: 18,
    fontWeight: '700',
  },
  deleteButton: {
    margin: 0,
  },
  name: {
    fontSize: 14,
    marginBottom: 8,
  },
  predictionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  predictionItem: {
    flex: 1,
  },
  predictionLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  predictionValue: {
    fontWeight: '600',
  },
});
