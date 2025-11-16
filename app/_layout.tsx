/**
 * Root Layout
 * Sets up providers and app initialization
 */

import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { Slot } from 'expo-router';
import Head from 'expo-router/head';
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
import '../src/types/theme'; // Import theme type augmentation

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
      const startTime = performance.now();
      console.log('[App] Starting initialization...');

      try {
        // Validate environment configuration
        const envStart = performance.now();
        const { validateEnvironment, logEnvironmentStatus } = await import('../src/config/environment');
        validateEnvironment();
        logEnvironmentStatus();
        console.log(`[App] Environment config loaded in ${(performance.now() - envStart).toFixed(0)}ms`);

        // Log feature flags for debugging
        const flagsStart = performance.now();
        const { logFeatureFlags } = await import('../src/config/features');
        logFeatureFlags();
        console.log(`[App] Feature flags loaded in ${(performance.now() - flagsStart).toFixed(0)}ms`);

        // Initialize database - platform-specific implementation
        const dbStart = performance.now();
        const { initializeDatabase } = await import('../src/database');
        await initializeDatabase();
        console.log(`[App] Database initialized in ${(performance.now() - dbStart).toFixed(0)}ms (${Platform.OS})`);

        console.log(`[App] Total initialization time: ${(performance.now() - startTime).toFixed(0)}ms`);
        setIsReady(true);
      } catch (error) {
        console.error('[App] Initialization error:', error);

        // Re-throw validation errors - app cannot start with invalid config
        if (error instanceof Error && error.message.includes('Environment Configuration Error')) {
          throw error; // Halt initialization for config errors
        }

        // For non-critical errors (DB init, etc.), log and continue
        console.warn('[App] Non-critical initialization error - continuing...');
        setIsReady(true);
      }
    }

    initialize();
  }, []);

  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <Head>
        <title>Stock Tracker - Professional Stock Analysis & Portfolio Management</title>
        <meta
          name="description"
          content="Track stocks, analyze market sentiment, and visualize price trends with our professional stock tracking application. Real-time data, sentiment analysis, and portfolio management."
        />
        <meta
          name="keywords"
          content="stocks, finance, portfolio, trading, sentiment analysis, stock market, investment, stock tracker"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <meta name="theme-color" content="#121212" />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Stock Tracker - Professional Stock Analysis" />
        <meta
          property="og:description"
          content="Track stocks, analyze sentiment, and manage your portfolio with real-time data and professional charts."
        />
        <meta property="og:site_name" content="Stock Tracker" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Stock Tracker - Professional Analysis" />
        <meta
          name="twitter:description"
          content="Professional stock tracking and sentiment analysis platform"
        />

        {/* PWA Meta Tags */}
        <meta name="application-name" content="Stock Tracker" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Stock Tracker" />
      </Head>

      <GestureHandlerRootView style={styles.container}>
        <SafeAreaProvider>
          <PaperProvider theme={theme}>
            <QueryClientProvider client={queryClient}>
              <StockProvider>
                <PortfolioProvider>
                  <Slot />
                  <StatusBar style="light" />
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
    backgroundColor: theme.colors.background,
  },
});
