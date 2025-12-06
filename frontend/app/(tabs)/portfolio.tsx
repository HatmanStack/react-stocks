/**
 * Portfolio Screen
 * Displays user's saved stocks
 */

import React, { useState, useCallback } from 'react';
import { FlatList, StyleSheet, RefreshControl, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn } from 'react-native-reanimated';
import { PortfolioItem } from '@/components/portfolio/PortfolioItem';
import { PortfolioItemSkeleton } from '@/components/portfolio/PortfolioItemSkeleton';
import { AddStockButton } from '@/components/portfolio/AddStockButton';
import { AddStockModal } from '@/components/portfolio/AddStockModal';
import { ErrorDisplay } from '@/components/common/ErrorDisplay';
import { EmptyState } from '@/components/common/EmptyState';
import { OfflineIndicator } from '@/components/common/OfflineIndicator';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useStock } from '@/contexts/StockContext';
import { syncAllData } from '@/services/sync/syncOrchestrator';
import { logger } from '@/utils/logger';
import type { PortfolioDetails } from '@/types/database.types';
import { differenceInDays } from 'date-fns';

export default function PortfolioScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const theme = useTheme();
  const { portfolio, isLoading, error, refetch, removeFromPortfolio } = usePortfolio();
  const { setSelectedTicker, startDate, endDate } = useStock();

  const handleStockPress = useCallback((item: PortfolioDetails) => {
    setSelectedTicker(item.ticker);
    router.push(`/(tabs)/stock/${item.ticker}`);
  }, [setSelectedTicker]);

  const handleDeleteStock = useCallback((item: PortfolioDetails) => {
    Alert.alert(
      'Remove Stock',
      `Remove ${item.ticker} from your portfolio?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeFromPortfolio(item.ticker);
            } catch (err) {
              logger.error('[PortfolioScreen] Error removing stock:', err);
              Alert.alert('Error', 'Failed to remove stock from portfolio');
            }
          },
        },
      ]
    );
  }, [removeFromPortfolio]);

  const handleAddStock = useCallback(() => {
    setModalVisible(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
  }, []);

  const handleRefresh = useCallback(async () => {
    try {
      // Haptic feedback on refresh trigger (mobile only)
      if (Platform.OS !== 'web') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      setRefreshing(true);

      // Calculate number of days to sync
      const days = Math.abs(differenceInDays(new Date(endDate), new Date(startDate))) + 1;

      logger.debug(`[PortfolioScreen] Refreshing ${portfolio.length} stocks`);

      for (const item of portfolio) {
        try {
          await syncAllData(item.ticker, days);
        } catch (err) {
          logger.error(`[PortfolioScreen] Error refreshing ${item.ticker}:`, err);
        }
      }

      await refetch();
      setRefreshing(false);
    } catch (err) {
      logger.error('[PortfolioScreen] Error during refresh:', err);
      setRefreshing(false);
    }
  }, [portfolio, startDate, endDate, refetch]);

  const renderPortfolioItem = useCallback(
    ({ item }: { item: PortfolioDetails }) => (
      <Animated.View entering={FadeIn.duration(200)}>
        <PortfolioItem
          item={item}
          onPress={() => handleStockPress(item)}
          onDelete={() => handleDeleteStock(item)}
        />
      </Animated.View>
    ),
    [handleStockPress, handleDeleteStock]
  );

  const renderSkeletonItem = useCallback(
    ({ index }: { index: number }) => <PortfolioItemSkeleton key={`skeleton-${index}`} />,
    []
  );

  const renderEmptyState = () => (
    <EmptyState
      message="No stocks in portfolio"
      description="Add stocks to your watchlist to track their performance"
      icon="briefcase-outline"
    />
  );

  if (error) {
    return (
      <ErrorDisplay
        error={error as Error}
        onRetry={refetch}
        title="Failed to load portfolio"
      />
    );
  }

  // Show skeleton loaders during initial load
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
        <OfflineIndicator />
        <FlatList
          data={Array.from({ length: 6 })}
          renderItem={renderSkeletonItem}
          keyExtractor={(_, index) => `skeleton-${index}`}
          contentContainerStyle={styles.listContent}
        />
        <AddStockButton onPress={handleAddStock} />
        <AddStockModal visible={modalVisible} onDismiss={handleCloseModal} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <OfflineIndicator />
      <FlatList
        data={portfolio}
        renderItem={renderPortfolioItem}
        keyExtractor={(item) => item.ticker}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={portfolio.length === 0 ? styles.emptyContent : styles.listContent}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        initialNumToRender={10}
        windowSize={21}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
            progressBackgroundColor={theme.colors.surface}
          />
        }
      />
      <AddStockButton onPress={handleAddStock} />
      <AddStockModal visible={modalVisible} onDismiss={handleCloseModal} />
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
  emptyContent: {
    flex: 1,
  },
});
