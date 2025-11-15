/**
 * Add Stock Modal Component
 * Modal dialog for searching and adding stocks to portfolio
 */

import React, { useState, useCallback } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { Modal, Portal, Appbar, Searchbar } from 'react-native-paper';
import { SearchResultItem } from '@/components/search/SearchResultItem';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { ErrorDisplay } from '@/components/common/ErrorDisplay';
import { EmptyState } from '@/components/common/EmptyState';
import { useSymbolSearch } from '@/hooks/useSymbolSearch';
import { usePortfolioContext } from '@/contexts/PortfolioContext';
import type { SymbolDetails } from '@/types/database.types';

interface AddStockModalProps {
  visible: boolean;
  onDismiss: () => void;
}

export function AddStockModal({ visible, onDismiss }: AddStockModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const { addToPortfolio, isInPortfolio } = usePortfolioContext();

  // Search for symbols
  const {
    data: searchResults = [],
    isLoading,
    error,
    refetch,
  } = useSymbolSearch(searchQuery, {
    minLength: 1,
    enabled: searchQuery.length > 0 && visible,
  });

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const handleSelectStock = useCallback(async (symbol: SymbolDetails) => {
    try {
      // Check if already in portfolio
      if (isInPortfolio(symbol.ticker)) {
        console.log(`[AddStockModal] ${symbol.ticker} already in portfolio`);
        // Still close the modal
        setSearchQuery('');
        onDismiss();
        return;
      }

      console.log(`[AddStockModal] Adding ${symbol.ticker} to portfolio`);
      await addToPortfolio(symbol.ticker);

      // Clear search and close modal
      setSearchQuery('');
      onDismiss();
    } catch (error) {
      console.error('[AddStockModal] Error adding stock:', error);
    }
  }, [addToPortfolio, isInPortfolio, onDismiss]);

  const handleClose = useCallback(() => {
    setSearchQuery('');
    onDismiss();
  }, [onDismiss]);

  const renderSearchResult = useCallback(
    ({ item }: { item: SymbolDetails }) => {
      const alreadyAdded = isInPortfolio(item.ticker);
      return (
        <SearchResultItem
          symbol={item}
          onPress={() => handleSelectStock(item)}
          disabled={alreadyAdded}
          subtitle={alreadyAdded ? 'Already in portfolio' : undefined}
        />
      );
    },
    [handleSelectStock, isInPortfolio]
  );

  const renderEmptyState = () => {
    if (searchQuery.length === 0) {
      return (
        <EmptyState
          message="Search for stocks"
          description="Enter a ticker symbol or company name"
          icon="search-outline"
        />
      );
    }

    if (isLoading) {
      return <LoadingIndicator message="Searching..." />;
    }

    if (error) {
      return (
        <ErrorDisplay
          error={error as Error}
          onRetry={refetch}
          title="Search failed"
        />
      );
    }

    return (
      <EmptyState
        message="No results found"
        description={`No stocks found matching "${searchQuery}"`}
        icon="alert-circle-outline"
      />
    );
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={handleClose}
        contentContainerStyle={styles.modal}
      >
        <View style={styles.container}>
          <Appbar.Header elevated>
            <Appbar.Content title="Add Stock to Portfolio" />
            <Appbar.Action icon="close" onPress={handleClose} />
          </Appbar.Header>

          <View style={styles.searchContainer}>
            <Searchbar
              placeholder="Search ticker or company name"
              onChangeText={handleSearchChange}
              value={searchQuery}
              autoFocus
              style={styles.searchBar}
            />
          </View>

          <FlatList
            data={searchResults}
            renderItem={renderSearchResult}
            keyExtractor={(item) => item.ticker}
            ListEmptyComponent={renderEmptyState}
            contentContainerStyle={
              searchResults.length === 0 ? styles.emptyContent : styles.listContent
            }
          />
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    margin: 20,
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  searchContainer: {
    padding: 12,
    backgroundColor: '#fff',
  },
  searchBar: {
    elevation: 0,
    backgroundColor: '#F5F5F5',
  },
  listContent: {
    paddingBottom: 16,
  },
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
});
