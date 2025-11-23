/**
 * Sentiment Screen
 * Displays sentiment analysis data for a stock
 *
 * **Phase 5 Enhancement (Task 6):** Event type filtering with filter chips
 */

import React, { useState, useMemo, useEffect } from 'react';
import { View, StyleSheet, FlatList, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, Chip } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStockDetail } from '@/contexts/StockDetailContext';
import { SentimentToggle } from '@/components/sentiment/SentimentToggle';
import { SentimentChart } from '@/components/charts/SentimentChart';
import { CombinedWordItem } from '@/components/sentiment/CombinedWordItem';
import { SingleWordItem } from '@/components/sentiment/SingleWordItem';
import { Skeleton } from '@/components/common/Skeleton';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { ErrorDisplay } from '@/components/common/ErrorDisplay';
import { EmptyState } from '@/components/common/EmptyState';
import type { CombinedWordDetails, WordCountDetails, EventType } from '@/types/database.types';

const EVENT_TYPES: EventType[] = ['EARNINGS', 'M&A', 'GUIDANCE', 'ANALYST_RATING', 'PRODUCT_LAUNCH', 'GENERAL'];
const FILTER_STORAGE_KEY = '@sentiment_event_filter';

export default function SentimentScreen() {
  const theme = useTheme();
  const [viewMode, setViewMode] = useState<'aggregate' | 'individual'>('aggregate');
  const [selectedEventTypes, setSelectedEventTypes] = useState<Set<EventType>>(new Set(EVENT_TYPES));

  // Get sentiment data from context (already fetched at layout level)
  const {
    sentimentData: aggregateData,
    sentimentLoading: isAggregateLoading,
    sentimentError: aggregateError,
    articleSentimentData: articleData,
    articleSentimentLoading: isArticleLoading,
    articleSentimentError: articleError,
  } = useStockDetail();

  // Load filter selection from storage on mount
  useEffect(() => {
    loadFilterSelection();
  }, []);

  const saveFilterSelection = async () => {
    try {
      await AsyncStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify(Array.from(selectedEventTypes))
      );
    } catch (error) {
      console.warn('[SentimentScreen] Failed to save filter selection:', error);
    }
  };

  // Save filter selection to storage whenever it changes
  useEffect(() => {
    saveFilterSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventTypes]);

  const loadFilterSelection = async () => {
    try {
      const stored = await AsyncStorage.getItem(FILTER_STORAGE_KEY);
      if (stored) {
        const eventTypes = JSON.parse(stored) as EventType[];
        setSelectedEventTypes(new Set(eventTypes));
      }
    } catch (error) {
      console.warn('[SentimentScreen] Failed to load filter selection:', error);
    }
  };


  const toggleEventType = (eventType: EventType) => {
    const newSelection = new Set(selectedEventTypes);
    if (newSelection.has(eventType)) {
      newSelection.delete(eventType);
      // Ensure at least one event type is selected
      if (newSelection.size === 0) {
        newSelection.add(eventType);
      }
    } else {
      newSelection.add(eventType);
    }
    setSelectedEventTypes(newSelection);
  };

  const selectAllEventTypes = () => {
    setSelectedEventTypes(new Set(EVENT_TYPES));
  };

  // Filter and sort data based on selected event types
  const filteredAggregateData = useMemo(() => {
    if (!aggregateData) return [];

    // If all event types are selected, don't filter
    if (selectedEventTypes.size === EVENT_TYPES.length) {
      return [...aggregateData].sort((a, b) => b.date.localeCompare(a.date));
    }

    // Filter by parsing eventCounts
    return aggregateData
      .filter((item) => {
        if (!item.eventCounts) return true; // Include items without eventCounts

        try {
          const eventCounts = JSON.parse(item.eventCounts) as Record<string, number>;
          // Check if any of the selected event types have count > 0
          return Object.entries(eventCounts).some(
            ([type, count]) => count > 0 && selectedEventTypes.has(type as EventType)
          );
        } catch {
          return true; // Include items with parse errors
        }
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [aggregateData, selectedEventTypes]);

  const sortedArticleData = useMemo(() => {
    if (!articleData) return [];
    return [...articleData].sort((a, b) => b.date.localeCompare(a.date));
  }, [articleData]);

  // Count events per type for display
  const eventTypeCounts = useMemo(() => {
    const counts: Record<EventType, number> = {
      EARNINGS: 0,
      'M&A': 0,
      GUIDANCE: 0,
      ANALYST_RATING: 0,
      PRODUCT_LAUNCH: 0,
      GENERAL: 0,
    };

    if (!aggregateData) return counts;

    aggregateData.forEach((item) => {
      if (!item.eventCounts) return;

      try {
        const eventCounts = JSON.parse(item.eventCounts) as Record<string, number>;
        Object.entries(eventCounts).forEach(([type, count]) => {
          if (type in counts) {
            counts[type as EventType] += count;
          }
        });
      } catch {
        // Ignore parse errors
      }
    });

    return counts;
  }, [aggregateData]);

  const renderAggregateItem = ({ item }: { item: CombinedWordDetails }) => (
    <CombinedWordItem item={item} />
  );

  const renderArticleItem = ({ item }: { item: WordCountDetails }) => (
    <SingleWordItem item={item} />
  );

  const keyExtractorAggregate = (item: CombinedWordDetails) => `${item.ticker}-${item.date}`;
  const keyExtractorArticle = (item: WordCountDetails, index: number) =>
    `${item.ticker}-${item.date}-${item.hash || index}`; // Use date+hash for uniqueness

  // Render event filter chips
  const renderEventFilters = () => (
    <View style={styles.filterContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScrollContent}>
        <Chip
          selected={selectedEventTypes.size === EVENT_TYPES.length}
          onPress={selectAllEventTypes}
          style={styles.filterChip}
          mode="outlined"
        >
          All ({Object.values(eventTypeCounts).reduce((sum, count) => sum + count, 0)})
        </Chip>
        {EVENT_TYPES.map((eventType) => (
          <Chip
            key={eventType}
            selected={selectedEventTypes.has(eventType)}
            onPress={() => toggleEventType(eventType)}
            style={styles.filterChip}
            mode="outlined"
          >
            {eventType.replace('_', ' ')} ({eventTypeCounts[eventType]})
          </Chip>
        ))}
      </ScrollView>
    </View>
  );

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
      if (!filteredAggregateData || filteredAggregateData.length === 0) {
        return (
          <View style={styles.emptyContainer}>
            <EmptyState
              message={
                selectedEventTypes.size < EVENT_TYPES.length
                  ? 'No data for selected event types'
                  : 'No aggregated sentiment data available'
              }
              icon="document-text-outline"
            />
          </View>
        );
      }
      return (
        <FlatList
          data={filteredAggregateData}
          renderItem={renderAggregateItem}
          keyExtractor={keyExtractorAggregate}
          ListHeaderComponent={() => (
            <>
              {renderEventFilters()}
              <View style={styles.chartContainer}>
                {isAggregateLoading ? (
                  <Skeleton width="90%" height={220} style={styles.chartSkeleton} />
                ) : filteredAggregateData && filteredAggregateData.length > 0 ? (
                  <SentimentChart data={filteredAggregateData} />
                ) : null}
              </View>
            </>
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
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      <SentimentToggle value={viewMode} onValueChange={setViewMode} />
      {renderContent()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterContainer: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  filterScrollContent: {
    paddingRight: 16,
    gap: 8,
  },
  filterChip: {
    marginRight: 8,
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
