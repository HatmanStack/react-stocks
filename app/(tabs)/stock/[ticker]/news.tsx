/**
 * News Screen
 * Displays news articles for a stock
 */

import React, { useMemo, useCallback } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from 'react-native-paper';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useStockDetail } from '@/contexts/StockDetailContext';
import { NewsListItem } from '@/components/news/NewsListItem';
import { NewsListItemSkeleton } from '@/components/news/NewsListItemSkeleton';
import { ErrorDisplay } from '@/components/common/ErrorDisplay';
import { EmptyState } from '@/components/common/EmptyState';
import type { NewsDetails } from '@/types/database.types';

export default function NewsScreen() {
  const theme = useTheme();
  // Get news data from context (already fetched at layout level)
  const { newsData, newsLoading: isLoading, newsError: error } = useStockDetail();

  // Sort news by date descending (most recent first)
  const sortedNewsData = useMemo(() => {
    if (!newsData) return [];
    return [...newsData].sort((a, b) => b.articleDate.localeCompare(a.articleDate));
  }, [newsData]);

  const renderSkeletonItem = useCallback(
    ({ index }: { index: number }) => <NewsListItemSkeleton key={`skeleton-${index}`} />,
    []
  );

  const renderNewsItem = useCallback(
    ({ item }: { item: NewsDetails }) => (
      <Animated.View entering={FadeIn.duration(200)}>
        <NewsListItem item={item} />
      </Animated.View>
    ),
    []
  );

  // Render loading state with skeleton
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
        <FlatList
          data={Array.from({ length: 5 })}
          renderItem={renderSkeletonItem}
          keyExtractor={(_, index) => `skeleton-${index}`}
          contentContainerStyle={styles.listContent}
        />
      </SafeAreaView>
    );
  }

  // Render error state
  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <ErrorDisplay
          error={error || 'Failed to load news articles'}
        />
      </SafeAreaView>
    );
  }

  // Render empty state
  if (!sortedNewsData || sortedNewsData.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
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

  const keyExtractor = useCallback(
    (item: NewsDetails, index: number) => item.articleUrl || `${item.ticker}-${item.articleDate}-${index}`,
    []
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      <FlatList
        data={sortedNewsData}
        renderItem={renderNewsItem}
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
