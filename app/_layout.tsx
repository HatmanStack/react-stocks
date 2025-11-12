/**
 * Root Layout
 * Sets up providers and app initialization
 */

import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { Slot } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { enGB, registerTranslation } from 'react-native-paper-dates';

// Register date picker locale
registerTranslation('en', enGB);

// Contexts
import { StockProvider } from '../src/contexts/StockContext';
import { PortfolioProvider } from '../src/contexts/PortfolioContext';

// Theme
import { theme } from '../src/theme/theme';

// Error Boundary
import { ErrorBoundary } from '../src/components/common/ErrorBoundary';

// Create QueryClient instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function initialize() {
      try {
        // Log feature flags for debugging
        const { logFeatureFlags } = await import('../src/config/features');
        logFeatureFlags();

        // Initialize database - platform-specific implementation
        const { initializeDatabase } = await import('../src/database');
        await initializeDatabase();
        console.log(`[App] Database initialized successfully (${Platform.OS})`);

        setIsReady(true);
      } catch (error) {
        console.error('[App] Initialization error:', error);
        // For now, continue even if initialization fails
        setIsReady(true);
      }
    }

    initialize();
  }, []);

  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.container}>
        <SafeAreaProvider>
          <PaperProvider theme={theme}>
            <QueryClientProvider client={queryClient}>
              <StockProvider>
                <PortfolioProvider>
                  <Slot />
                  <StatusBar style="dark" />
                </PortfolioProvider>
              </StockProvider>
            </QueryClientProvider>
          </PaperProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});
