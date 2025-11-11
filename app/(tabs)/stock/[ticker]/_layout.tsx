/**
 * Stock Detail Layout
 * Contains header with ticker info and material top tabs for Price, Sentiment, News
 */

import { useEffect, useCallback } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, Slot } from 'expo-router';
import { Appbar } from 'react-native-paper';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { withLayoutContext } from 'expo-router';
import { useSymbolDetails } from '@/hooks/useSymbolSearch';
import { usePortfolioContext } from '@/contexts/PortfolioContext';
import { useStock } from '@/contexts/StockContext';
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
    <View style={styles.container}>
      <OfflineIndicator />
      <Appbar.Header elevated>
        <Appbar.Content
          title={ticker}
          subtitle={isLoading ? 'Loading...' : companyName}
        />
        <Appbar.Action
          icon={inPortfolio ? 'star' : 'star-outline'}
          onPress={handleTogglePortfolio}
          color={inPortfolio ? '#FFD700' : '#9E9E9E'}
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
