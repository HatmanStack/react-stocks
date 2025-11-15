/**
 * News Screen
 * Displays news articles for a stock
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStockDetail } from '@/contexts/StockDetailContext';
import { NewsListItem } from '@/components/news/NewsListItem';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { ErrorDisplay } from '@/components/common/ErrorDisplay';
import { EmptyState } from '@/components/common/EmptyState';
import type { NewsDetails } from '@/types/database.types';

export default function NewsScreen() {
  // Get news data from context (already fetched at layout level)
  const { newsData, newsLoading: isLoading, newsError: error } = useStockDetail();

  // Sort news by date descending (most recent first)
  const sortedNewsData = useMemo(() => {
    if (!newsData) return [];
    return [...newsData].sort((a, b) => b.articleDate.localeCompare(a.articleDate));
  }, [newsData]);

  // Render loading state
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingIndicator message="Loading news..." />
      </SafeAreaView>
    );
  }

  // Render error state
  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorDisplay
          error={error || 'Failed to load news articles'}
        />
      </SafeAreaView>
    );
  }

  // Render empty state
  if (!sortedNewsData || sortedNewsData.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <EmptyState
            message="No news articles available for the selected date range"
            icon="newspaper-outline"
            description="Try expanding your date range to see more articles"
          />
        </View>
      </SafeAreaView>
    );
  }

  const renderItem = ({ item }: { item: NewsDetails }) => (
    <NewsListItem item={item} />
  );

  const keyExtractor = (item: NewsDetails, index: number) =>
    item.articleUrl || `${item.ticker}-${item.articleDate}-${index}`;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={sortedNewsData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        initialNumToRender={10}
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
  listContent: {
    paddingVertical: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
});
