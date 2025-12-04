/**
 * Price Screen
 * Displays price chart and OHLCV data for a stock
 */

import React, { useState, useMemo } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { StockDetailTabScreenProps } from '../navigation/navigationTypes';
import { useStockData } from '@/hooks/useStockData';
import { useSymbolDetails } from '@/hooks/useSymbolSearch';
import { StockMetadataCard } from '@/components/stock/StockMetadataCard';
import { PriceListHeader } from '@/components/stock/PriceListHeader';
import { PriceListItem } from '@/components/stock/PriceListItem';
import { PriceChart } from '@/components/charts/PriceChart';
import { TimeRangeSelector, getTimeRangeDays } from '@/components/common/TimeRangeSelector';
import type { TimeRange } from '@/components/common/TimeRangeSelector';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { ErrorDisplay } from '@/components/common/ErrorDisplay';
import { EmptyState } from '@/components/common/EmptyState';
import type { StockDetails } from '@/types/database.types';

type Props = StockDetailTabScreenProps<'Price'>;

export default function PriceScreen({ route }: Props) {
  const { ticker } = route.params;
  const [selectedRange, setSelectedRange] = useState<TimeRange>('1M');

  // Calculate number of days based on selected range
  const days = useMemo(() => getTimeRangeDays(selectedRange), [selectedRange]);

  // Fetch symbol details for metadata card
  const {
    data: symbol,
    isLoading: isSymbolLoading,
    error: symbolError,
  } = useSymbolDetails(ticker);

  // Fetch stock price data
  const {
    data: stockData,
    isLoading: isPriceLoading,
    error: priceError,
    refetch,
  } = useStockData(ticker, { days });

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
          onRetry={refetch}
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
            <View style={styles.chartContainer}>
              <PriceChart data={stockData || []} />
            </View>
            <TimeRangeSelector
              selectedRange={selectedRange}
              onRangeChange={setSelectedRange}
            />
            <StockMetadataCard symbol={symbol || null} isLoading={isSymbolLoading} />
            <PriceListHeader />
          </View>
        )}
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
    alignItems: 'center',
    paddingVertical: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
});
