/**
 * Portfolio Item Component
 * Displays a stock in the portfolio with price, change, and mini chart
 * Redesigned for dense two-line layout
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { IconButton, useTheme } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeOut } from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';
import type { PortfolioDetails } from '@/types/database.types';
import { MonoText, AnimatedCard, AnimatedNumber } from '@/components/common';
import { MiniChart } from '@/components/charts';
import { formatPrice, formatPercentage } from '@/utils/formatting';
import { useLatestStockPrice, useStockData } from '@/hooks';
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

  // Fetch recent stock data for mini chart (last 30 days)
  const { data: stockHistory } = useStockData(item.ticker, 30);

  // Calculate price change percentage
  const priceChange = useMemo(() => {
    // Use explicit null/undefined checks to allow zero values
    if (latestPrice == null || latestPrice.close == null || latestPrice.open == null) {
      return { value: 0, percentage: 0 };
    }
    const value = latestPrice.close - latestPrice.open;
    const percentage = latestPrice.open !== 0 ? (value / latestPrice.open) : 0;
    return { value, percentage };
  }, [latestPrice]);

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!stockHistory || stockHistory.length === 0) return [];

    // Create a copy before sorting to avoid mutating the original array
    return [...stockHistory]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(item => ({
        x: new Date(item.date),
        y: item.close,
      }));
  }, [stockHistory]);

  const isPositive = priceChange.percentage > 0;
  const isNegative = priceChange.percentage < 0;

  // Render right swipe action (delete)
  const renderRightActions = () => (
    <View style={[styles.deleteAction, { backgroundColor: theme.colors.error }]}>
      <Ionicons name="trash" size={24} color={theme.colors.onError} />
      <Text style={[styles.deleteText, { color: theme.colors.onError }]}>Delete</Text>
    </View>
  );

  const handleSwipeOpen = () => {
    onDelete();
  };

  return (
    <Animated.View exiting={FadeOut.duration(200)}>
      <Swipeable
        renderRightActions={renderRightActions}
        onSwipeableOpen={handleSwipeOpen}
        overshootRight={false}
        friction={2}
        rightThreshold={40}
      >
        <AnimatedCard
          onPress={onPress}
          style={[
            styles.card,
            {
              marginHorizontal: 12,
              marginVertical: cardSpacing,
            },
          ]}
          accessibilityLabel={`${item.ticker}, ${item.name || 'Stock'}. Price: ${formatPrice(latestPrice?.close || 0)}, Change: ${formatPercentage(priceChange.percentage)}`}
          accessibilityHint="Double tap to view stock details. Swipe left to delete"
          accessibilityRole="button"
        >
      <View style={{ padding: cardPadding }}>
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
              {isLoading ? (
                <MonoText
                  variant="price"
                  style={[
                    styles.price,
                    { color: theme.colors.onSurface, fontSize: fontSize.title },
                  ]}
                  allowFontScaling={true}
                >
                  --
                </MonoText>
              ) : (
                <AnimatedNumber
                  value={latestPrice?.close || 0}
                  formatter={(val) => formatPrice(val)}
                  variant="price"
                  style={[
                    styles.price,
                    { color: theme.colors.onSurface, fontSize: fontSize.title },
                  ]}
                  allowFontScaling={true}
                />
              )}

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
                  <AnimatedNumber
                    value={priceChange.percentage}
                    formatter={(val) => formatPercentage(val)}
                    variant="percentage"
                    positive={isPositive}
                    negative={isNegative}
                    style={[styles.change, { fontSize: fontSize.subtitle }]}
                    allowFontScaling={true}
                  />
                </View>
              )}
            </View>

            {/* Mini chart */}
            {chartData.length > 0 ? (
              <MiniChart data={chartData} width={60} height={28} positive={isPositive} />
            ) : (
              <View style={[styles.chartPlaceholder, { backgroundColor: `${theme.colors.surfaceVariant}19` }]}>
                <Text style={[styles.chartText, { color: theme.colors.onSurfaceVariant }]}>
                  --
                </Text>
              </View>
            )}
          </View>
        </View>
        </AnimatedCard>
      </Swipeable>
    </Animated.View>
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartText: {
    fontSize: 10,
    opacity: 0.5,
  },
  deleteAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    marginVertical: 6,
    marginRight: 12,
    borderRadius: 8,
  },
  deleteText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
});
