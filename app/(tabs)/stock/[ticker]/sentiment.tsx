/**
 * Sentiment Screen
 * Displays sentiment analysis data for a stock
 */

import React, { useState, useMemo } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStockDetail } from '@/contexts/StockDetailContext';
import { SentimentToggle } from '@/components/sentiment/SentimentToggle';
import { SentimentChart } from '@/components/charts/SentimentChart';
import { CombinedWordItem } from '@/components/sentiment/CombinedWordItem';
import { SingleWordItem } from '@/components/sentiment/SingleWordItem';
import { Skeleton } from '@/components/common/Skeleton';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { ErrorDisplay } from '@/components/common/ErrorDisplay';
import { EmptyState } from '@/components/common/EmptyState';
import type { CombinedWordDetails, WordCountDetails } from '@/types/database.types';

export default function SentimentScreen() {
  const [viewMode, setViewMode] = useState<'aggregate' | 'individual'>('aggregate');

  // Get sentiment data from context (already fetched at layout level)
  const {
    sentimentData: aggregateData,
    sentimentLoading: isAggregateLoading,
    sentimentError: aggregateError,
    articleSentimentData: articleData,
    articleSentimentLoading: isArticleLoading,
    articleSentimentError: articleError,
  } = useStockDetail();

  // Sort data by date descending (most recent first)
  const sortedAggregateData = useMemo(() => {
    if (!aggregateData) return [];
    return [...aggregateData].sort((a, b) => b.date.localeCompare(a.date));
  }, [aggregateData]);

  const sortedArticleData = useMemo(() => {
    if (!articleData) return [];
    return [...articleData].sort((a, b) => b.date.localeCompare(a.date));
  }, [articleData]);

  const renderAggregateItem = ({ item }: { item: CombinedWordDetails }) => (
    <CombinedWordItem item={item} />
  );

  const renderArticleItem = ({ item }: { item: WordCountDetails }) => (
    <SingleWordItem item={item} />
  );

  const keyExtractorAggregate = (item: CombinedWordDetails) => `${item.ticker}-${item.date}`;
  const keyExtractorArticle = (item: WordCountDetails, index: number) =>
    `${item.ticker}-${item.date}-${item.hash || index}`; // Use date+hash for uniqueness

  // Render content based on view mode
  const renderContent = () => {
    if (viewMode === 'aggregate') {
      // Handle aggregate view
      if (isAggregateLoading) {
        return <LoadingIndicator message="Loading aggregated sentiment data..." />;
      }
      if (aggregateError) {
        return <ErrorDisplay error={aggregateError || 'Failed to load sentiment data'} />;
      }
      if (!sortedAggregateData || sortedAggregateData.length === 0) {
        return (
          <View style={styles.emptyContainer}>
            <EmptyState
              message="No aggregated sentiment data available"
              icon="document-text-outline"
            />
          </View>
        );
      }
      return (
        <FlatList
          data={sortedAggregateData}
          renderItem={renderAggregateItem}
          keyExtractor={keyExtractorAggregate}
          ListHeaderComponent={() => (
            <View style={styles.chartContainer}>
              {isAggregateLoading ? (
                <Skeleton width="90%" height={220} style={styles.chartSkeleton} />
              ) : sortedAggregateData && sortedAggregateData.length > 0 ? (
                <SentimentChart data={sortedAggregateData} />
              ) : null}
            </View>
          )}
          contentContainerStyle={styles.listContent}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          initialNumToRender={10}
          windowSize={21}
        />
      );
    } else {
      // Handle individual articles view
      if (isArticleLoading) {
        return <LoadingIndicator message="Loading article sentiment data..." />;
      }
      if (articleError) {
        return <ErrorDisplay error={articleError || 'Failed to load article sentiment'} />;
      }
      if (!sortedArticleData || sortedArticleData.length === 0) {
        return (
          <View style={styles.emptyContainer}>
            <EmptyState
              message="No article sentiment data available"
              icon="document-text-outline"
            />
          </View>
        );
      }
      return (
        <FlatList
          data={sortedArticleData}
          renderItem={renderArticleItem}
          keyExtractor={keyExtractorArticle}
          contentContainerStyle={styles.listContent}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          initialNumToRender={10}
          windowSize={21}
        />
      );
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <SentimentToggle value={viewMode} onValueChange={setViewMode} />
      {renderContent()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.Create({
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
