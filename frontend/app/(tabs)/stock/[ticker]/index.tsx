/**
 * Price Screen - Displays OHLCV price data for a stock
 */

import React, { useMemo, useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from 'react-native-paper';
import { useStockDetail } from '@/contexts/StockDetailContext';
import { useStock } from '@/contexts/StockContext';
import { useSymbolDetails } from '@/hooks/useSymbolSearch';
import { useResponsive } from '@/hooks/useResponsive';
import { StockMetadataCard } from '@/components/stock/StockMetadataCard';
import { PriceListHeader } from '@/components/stock/PriceListHeader';
import { PriceListItem } from '@/components/stock/PriceListItem';
import { PriceChart } from '@/components/charts/PriceChart';
import { TimeRangeSelector, getTimeRangeStartDate } from '@/components/common/TimeRangeSelector';
import type { TimeRange } from '@/components/common/TimeRangeSelector';
import { Skeleton } from '@/components/common/Skeleton';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { ErrorDisplay } from '@/components/common/ErrorDisplay';
import { EmptyState } from '@/components/common/EmptyState';
import { formatDateForDB } from '@/utils/date/dateUtils';
import type { StockDetails } from '@/types/database.types';

interface ChartSectionProps {
  data: StockDetails[];
  isLoading: boolean;
  selectedRange: TimeRange;
  onRangeChange: (range: TimeRange) => void;
  chartHeight?: number;
}

function ChartSection({ data, isLoading, selectedRange, onRangeChange, chartHeight = 250 }: ChartSectionProps) {
  return (
    <>
      <View style={styles.chartContainer}>
        {isLoading ? (
          <Skeleton width="90%" height={chartHeight} style={styles.chartSkeleton} />
        ) : data.length > 0 ? (
          <PriceChart data={data} />
        ) : null}
      </View>
      <View style={styles.timeRangeRow}>
        <TimeRangeSelector selectedRange={selectedRange} onRangeChange={onRangeChange} />
      </View>
    </>
  );
}

export default function PriceScreen() {
  const { ticker, stockData, stockLoading: isPriceLoading, stockError: priceError } = useStockDetail();
  const { setDateRange } = useStock();
  const theme = useTheme();
  const { isDesktop, isTablet } = useResponsive();
  const [selectedRange, setSelectedRange] = useState<TimeRange>('1M');

  // Handle time range change - update context so all tabs use same range
  const handleRangeChange = useCallback((range: TimeRange) => {
    setSelectedRange(range);
    const endDate = formatDateForDB(new Date());
    const startDate = formatDateForDB(getTimeRangeStartDate(range));
    setDateRange(startDate, endDate);
  }, [setDateRange]);

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

  if (isDesktop) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
        <ScrollView>
          <ChartSection
            data={sortedStockData}
            isLoading={isPriceLoading}
            selectedRange={selectedRange}
            onRangeChange={handleRangeChange}
          />
          <View style={styles.desktopLayout}>
            <View style={styles.desktopLeftColumn}>
              <PriceListHeader />
              {sortedStockData.map((item) => (
                <PriceListItem key={keyExtractor(item)} item={item} />
              ))}
            </View>
            <View style={styles.desktopRightColumn}>
              <StockMetadataCard symbol={symbol || null} isLoading={isSymbolLoading} />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (isTablet) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
        <FlatList
          data={sortedStockData}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={() => (
            <View>
              <ChartSection
                data={sortedStockData}
                isLoading={isPriceLoading}
                selectedRange={selectedRange}
                onRangeChange={handleRangeChange}
              />
              <StockMetadataCard symbol={symbol || null} isLoading={isSymbolLoading} />
              <PriceListHeader />
            </View>
          )}
          stickyHeaderIndices={[0]}
          removeClippedSubviews={true}
          maxToRenderPerBatch={15}
          initialNumToRender={15}
          windowSize={21}
        />
      </SafeAreaView>
    );
  }

  // Mobile layout
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      <ScrollView style={styles.mobileLayout}>
        <ChartSection
          data={sortedStockData}
          isLoading={isPriceLoading}
          selectedRange={selectedRange}
          onRangeChange={handleRangeChange}
          chartHeight={220}
        />
        <View style={styles.contentRow}>
          <View style={styles.priceColumn}>
            <PriceListHeader />
            {sortedStockData.map((item) => (
              <PriceListItem key={keyExtractor(item)} item={item} />
            ))}
          </View>
          <View style={styles.metadataColumn}>
            <StockMetadataCard symbol={symbol || null} isLoading={isSymbolLoading} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  // Mobile layout with chart + two-column
  mobileLayout: {
    flex: 1,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 8,
  },
  priceColumn: {
    width: '60%',
  },
  metadataColumn: {
    width: '40%',
    paddingLeft: 8,
  },
  // Time range selector row
  timeRangeRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    marginTop: -20,
    marginBottom: 8,
  },
  // Desktop responsive layout
  desktopLayout: {
    flexDirection: 'row',
    padding: 20,
  },
  desktopLeftColumn: {
    flex: 7,
    paddingRight: 10,
    overflow: 'hidden',
  },
  desktopRightColumn: {
    flex: 3,
    paddingLeft: 10,
    overflow: 'hidden',
  },
});
