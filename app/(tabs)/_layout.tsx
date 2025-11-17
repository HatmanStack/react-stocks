/**
 * Tab Layout
 * Bottom tab navigator
 */

import { Tabs, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from 'react-native-paper';
import { useStock } from '@/contexts/StockContext';

export default function TabLayout() {
  const theme = useTheme();
  const { selectedTicker } = useStock();
  const segments = useSegments();

  // Check if we're currently on a stock route
  const isOnStockRoute = segments.includes('stock');

  // Get ticker from URL segments if on stock route
  const tickerFromRoute = isOnStockRoute ? segments[segments.indexOf('stock') + 1] : null;
  const displayTicker = tickerFromRoute || selectedTicker || '[ticker]';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.surfaceVariant,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Search',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'search' : 'search-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="stock"
        options={{
          title: displayTicker,
          href: isOnStockRoute ? undefined : null, // Show only when on stock route
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'stats-chart' : 'stats-chart-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          title: 'Portfolio',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'briefcase' : 'briefcase-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
