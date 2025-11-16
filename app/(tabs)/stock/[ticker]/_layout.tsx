/**
 * Stock Detail Layout
 * Contains header with ticker info and material top tabs for Price, Sentiment, News
 */

import { useEffect, useCallback } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Appbar } from 'react-native-paper';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { withLayoutContext } from 'expo-router';
import { useSymbolDetails } from '@/hooks/useSymbolSearch';
import { usePortfolioContext } from '@/contexts/PortfolioContext';
import { useStock } from '@/contexts/StockContext';
import { StockDetailProvider } from '@/contexts/StockDetailContext';
import { OfflineIndicator } from '@/components/common/OfflineIndicator';

const { Navigator } = createMaterialTopTabNavigator();
const MaterialTopTabs = withLayoutContext(Navigator);

export default function StockDetailLayout() {
  const { ticker } = useLocalSearchParams<{ ticker: string }>();
  const { data: symbolInfo, isLoading } = useSymbolDetails(ticker || 'AAPL');
  const { isInPortfolio, addToPortfolio, removeFromPortfolio } = usePortfolioContext();
  const { setSelectedTicker } = useStock();

  const inPortfolio = isInPortfolio(ticker || 'AAPL');

  // Update selected ticker when screen loads
  useEffect(() => {
    if (ticker) {
      setSelectedTicker(ticker);
    }
  }, [ticker, setSelectedTicker]);

  const handleTogglePortfolio = useCallback(async () => {
    if (!ticker) return;

    try {
      if (inPortfolio) {
        Alert.alert(
          'Remove Stock',
          `Remove ${ticker} from your portfolio?`,
          [
            {
              text: 'Cancel',
              style: 'cancel',
            },
            {
              text: 'Remove',
              style: 'destructive',
              onPress: async () => {
                await removeFromPortfolio(ticker);
              },
            },
          ]
        );
      } else {
        // Add to portfolio with basic info
        await addToPortfolio(ticker);
      }
    } catch (error) {
      console.error('[StockDetailLayout] Error toggling portfolio:', error);
      Alert.alert('Error', 'Failed to update portfolio');
    }
  }, [inPortfolio, ticker, addToPortfolio, removeFromPortfolio]);

  const companyName = symbolInfo?.name || ticker;

  return (
    <StockDetailProvider ticker={ticker || 'AAPL'}>
      <View style={styles.container}>
        <OfflineIndicator />
        <Appbar.Header elevated style={styles.header}>
          <Appbar.Content
            title={ticker}
            subtitle={isLoading ? 'Loading...' : companyName}
            titleStyle={styles.headerTitle}
            subtitleStyle={styles.headerSubtitle}
          />
          <Appbar.Action
            icon={inPortfolio ? 'star' : 'star-outline'}
            onPress={handleTogglePortfolio}
            color={inPortfolio ? '#FFD700' : '#9E9E9E'}
            size={28}
          />
        </Appbar.Header>

        <MaterialTopTabs
          screenOptions={{
            tabBarActiveTintColor: '#1976D2',
            tabBarInactiveTintColor: '#666',
            tabBarIndicatorStyle: { backgroundColor: '#1976D2' },
            tabBarLabelStyle: { fontSize: 14, fontWeight: '600', textTransform: 'none' },
            tabBarStyle: { backgroundColor: '#fff' },
          }}
        >
          <MaterialTopTabs.Screen name="index" options={{ title: 'Price' }} />
          <MaterialTopTabs.Screen name="sentiment" options={{ title: 'Sentiment' }} />
          <MaterialTopTabs.Screen name="news" options={{ title: 'News' }} />
        </MaterialTopTabs>
      </View>
    </StockDetailProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    height: 72, // More spacious header
  },
  headerTitle: {
    fontSize: 28, // Larger ticker
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 18, // Larger company name
    marginTop: 4,
  },
});
