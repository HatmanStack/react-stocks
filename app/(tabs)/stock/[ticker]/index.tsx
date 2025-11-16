/**
 * Price Screen
 * Displays OHLCV price data for a stock
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useSymbolDetails } from '@/hooks/useSymbolSearch';
import { useStockDetail } from '@/contexts/StockDetailContext';
import { StockMetadataCard } from '@/components/stock/StockMetadataCard';
import { PriceListHeader } from '@/components/stock/PriceListHeader';
import { PriceListItem } from '@/components/stock/PriceListItem';
import { PriceChart } from '@/components/charts/PriceChart';
import { Skeleton } from '@/components/common/Skeleton';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { ErrorDisplay } from '@/components/common/ErrorDisplay';
import { EmptyState } from '@/components/common/EmptyState';
import type { StockDetails } from '@/types/database.types';

export default function PriceScreen() {
  const { ticker } = useLocalSearchParams<{ ticker: string }>();

  // Get stock data from context (already fetched at layout level)
  const { stockData, stockLoading: isPriceLoading, stockError: priceError } = useStockDetail();

  // Fetch symbol details for metadata card
  const {
    data: symbol,
    isLoading: isSymbolLoading,
    error: symbolError,
  } = useSymbolDetails(ticker as string);

  // Sort stock data by date descending (most recent first)
  const sortedStockData = useMemo(() => {
    if (!stockData) return [];
    return [...stockData].sort((a, b) => b.date.localeCompare(a.date));
  }, [stockData]);

  // Render loading state
  if (isSymbolLoading || isPriceLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingIndicator message="Loading price data..." />
      </SafeAreaView>
    );
  }

  // Render error state
  if (symbolError || priceError) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorDisplay
          error={priceError || symbolError || 'Failed to load price data'}
        />
      </SafeAreaView>
    );
  }

  // Render empty state
  if (!sortedStockData || sortedStockData.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <StockMetadataCard symbol={symbol || null} />
        <View style={styles.emptyContainer}>
          <EmptyState
            message="No price data available for the selected date range"
            icon="bar-chart-outline"
          />
        </View>
      </SafeAreaView>
    );
  }

  const renderItem = ({ item }: { item: StockDetails }) => (
    <PriceListItem item={item} />
  );

  const keyExtractor = (item: StockDetails) => `${item.ticker}-${item.date}`;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={sortedStockData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={() => (
          <View>
            <StockMetadataCard symbol={symbol || null} isLoading={isSymbolLoading} />

            {/* Price Chart */}
            <View style={styles.chartContainer}>
              {isPriceLoading ? (
                <Skeleton width="90%" height={220} style={styles.chartSkeleton} />
              ) : sortedStockData && sortedStockData.length > 0 ? (
                <PriceChart data={sortedStockData} />
              ) : null}
            </View>

            <PriceListHeader />
          </View>
        )}
        stickyHeaderIndices={[0]}
        removeClippedSubviews={true}
        maxToRenderPerBatch={15}
        updateCellsBatchingPeriod={50}
        initialNumToRender={15}
        windowSize={21}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  chartContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  chartSkeleton: {
    alignSelf: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
});
