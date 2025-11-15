/**
 * Portfolio Item Component
 * Displays a stock in the portfolio with price, change, and mini chart placeholder
 * Redesigned for dense two-line layout
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Card, IconButton, useTheme } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import type { PortfolioDetails } from '@/types/database.types';
import { MonoText } from '@/components/common';
import { formatPrice, formatPercentage } from '@/utils/formatting';
import { useLatestStockPrice } from '@/hooks';
import { useLayoutDensity } from '@/hooks';

interface PortfolioItemProps {
  item: PortfolioDetails;
  onPress: () => void;
  onDelete: () => void;
}

export function PortfolioItem({ item, onPress, onDelete }: PortfolioItemProps) {
  const theme = useTheme();
  const { cardSpacing, cardPadding, fontSize } = useLayoutDensity();

  // Fetch latest stock price for current price and change
  const { data: latestPrice, isLoading } = useLatestStockPrice(item.ticker);

  // Calculate price change percentage
  const priceChange = useMemo(() => {
    if (!latestPrice || !latestPrice.close || !latestPrice.open) {
      return { value: 0, percentage: 0 };
    }
    const value = latestPrice.close - latestPrice.open;
    const percentage = latestPrice.open !== 0 ? (value / latestPrice.open) : 0;
    return { value, percentage };
  }, [latestPrice]);

  const isPositive = priceChange.percentage > 0;
  const isNegative = priceChange.percentage < 0;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityLabel={`${item.ticker}, ${item.name || 'Stock'}. Price: ${formatPrice(latestPrice?.close || 0)}, Change: ${formatPercentage(priceChange.percentage)}`}
      accessibilityHint="Double tap to view stock details"
      accessibilityRole="button"
    >
      <Card
        style={[
          styles.card,
          {
            marginHorizontal: 12,
            marginVertical: cardSpacing,
          },
        ]}
      >
        <Card.Content style={{ padding: cardPadding }}>
          {/* Line 1: Ticker + Company Name + Delete Button */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <Text
                style={[
                  styles.ticker,
                  { color: theme.colors.primary, fontSize: fontSize.title + 2 },
                ]}
                allowFontScaling={true}
              >
                {item.ticker}
              </Text>
              {item.name && (
                <Text
                  style={[
                    styles.name,
                    { color: theme.colors.onSurfaceVariant, fontSize: fontSize.subtitle },
                  ]}
                  numberOfLines={1}
                  allowFontScaling={true}
                >
                  {item.name}
                </Text>
              )}
            </View>
            <IconButton
              icon="close-circle"
              size={18}
              iconColor={theme.colors.onSurfaceVariant}
              onPress={onDelete}
              style={styles.deleteButton}
              accessibilityLabel={`Remove ${item.ticker} from portfolio`}
              accessibilityHint="Double tap to remove this stock from your portfolio"
              accessibilityRole="button"
            />
          </View>

          {/* Line 2: Current Price + Change% + Mini Chart Placeholder */}
          <View style={styles.priceRow}>
            <View style={styles.priceInfo}>
              <MonoText
                variant="price"
                style={[
                  styles.price,
                  { color: theme.colors.onSurface, fontSize: fontSize.title },
                ]}
                allowFontScaling={true}
              >
                {isLoading ? '--' : formatPrice(latestPrice?.close || 0)}
              </MonoText>

              {!isLoading && (
                <View style={styles.changeContainer}>
                  <Ionicons
                    name={isPositive ? 'arrow-up' : isNegative ? 'arrow-down' : 'remove'}
                    size={12}
                    color={
                      isPositive
                        ? theme.colors.positive
                        : isNegative
                        ? theme.colors.negative
                        : theme.colors.onSurfaceVariant
                    }
                    style={styles.changeIcon}
                  />
                  <MonoText
                    variant="percentage"
                    positive={isPositive}
                    negative={isNegative}
                    style={[styles.change, { fontSize: fontSize.subtitle }]}
                    allowFontScaling={true}
                  >
                    {formatPercentage(priceChange.percentage)}
                  </MonoText>
                </View>
              )}
            </View>

            {/* Mini chart placeholder - will be implemented in Phase 3 */}
            <View style={styles.chartPlaceholder}>
              <Text style={[styles.chartText, { color: theme.colors.onSurfaceVariant }]}>
                Chart
              </Text>
            </View>
          </View>
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    // Dynamic margins set via inline styles
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  ticker: {
    fontWeight: '700',
  },
  name: {
    fontWeight: '400',
    flex: 1,
  },
  deleteButton: {
    margin: -8,
    marginTop: -12,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceInfo: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
  },
  price: {
    fontWeight: '600',
  },
  changeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  changeIcon: {
    marginTop: 2,
  },
  change: {
    fontWeight: '600',
  },
  chartPlaceholder: {
    width: 60,
    height: 30,
    borderRadius: 4,
    backgroundColor: 'rgba(158, 158, 158, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartText: {
    fontSize: 10,
    opacity: 0.5,
  },
});
