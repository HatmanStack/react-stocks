/**
 * Stock Detail Context
 * Fetches and provides all stock data (prices, news, sentiment) to child components
 * This ensures all tabs have access to the same data without refetching
 */

import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStockData } from '@/hooks/useStockData';
import { useNewsData } from '@/hooks/useNewsData';
import { useSentimentData, useArticleSentiment } from '@/hooks/useSentimentData';
import { useSentimentPolling } from '@/hooks/useSentimentPolling';
import { differenceInDays } from 'date-fns';
import { useStock } from './StockContext';
import type { StockDetails, NewsDetails, CombinedWordDetails, WordCountDetails } from '@/types/database.types';
import type { SentimentJobStatus } from '@/services/api/lambdaSentiment.service';

interface StockDetailContextType {
  ticker: string;
  days: number;

  // Stock price data
  stockData: StockDetails[];
  stockLoading: boolean;
  stockError: Error | null;

  // News data
  newsData: NewsDetails[];
  newsLoading: boolean;
  newsError: Error | null;

  // Sentiment data
  sentimentData: CombinedWordDetails[];
  sentimentLoading: boolean;
  sentimentError: Error | null;

  // Article sentiment data
  articleSentimentData: WordCountDetails[];
  articleSentimentLoading: boolean;
  articleSentimentError: Error | null;

  // Sentiment polling state (for async Lambda sentiment)
  isSentimentPolling: boolean;
  sentimentJobId: string | null;
  sentimentJobStatus: SentimentJobStatus | null;
  triggerSentimentAnalysis: () => Promise<void>;
  cancelSentimentPolling: () => void;
}

const StockDetailContext = createContext<StockDetailContextType | undefined>(undefined);

export function StockDetailProvider({
  children,
  ticker
}: {
  children: React.ReactNode;
  ticker: string;
}) {
  const { startDate, endDate } = useStock();
  const queryClient = useQueryClient();

  // Calculate number of days
  const days = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.abs(differenceInDays(end, start)) + 1;
  }, [startDate, endDate]);

  // Fetch all data at the provider level
  const { data: stockData = [], isLoading: stockLoading, error: stockError } = useStockData(ticker, { days });
  const { data: newsData = [], isLoading: newsLoading, error: newsError } = useNewsData(ticker, { days });
  const { data: sentimentData = [], isLoading: sentimentLoading, error: sentimentError } = useSentimentData(ticker, { days });
  const { data: articleSentimentData = [], isLoading: articleSentimentLoading, error: articleSentimentError } = useArticleSentiment(ticker, { days });

  // Sentiment polling (for async Lambda sentiment analysis)
  const {
    isPolling: isSentimentPolling,
    jobId: sentimentJobId,
    jobStatus: sentimentJobStatus,
    triggerAnalysis,
    cancelPolling,
  } = useSentimentPolling(ticker, startDate, endDate, {
    onComplete: useCallback((data) => {
      console.log('[StockDetailContext] Sentiment analysis complete:', data.length, 'days');
      // Invalidate React Query cache to re-fetch sentiment data
      queryClient.invalidateQueries({ queryKey: ['sentimentData', ticker] });
      queryClient.invalidateQueries({ queryKey: ['articleSentiment', ticker] });
    }, [ticker, queryClient]),
    onError: useCallback((error) => {
      console.error('[StockDetailContext] Sentiment analysis failed:', error);
    }, []),
  });

  const value: StockDetailContextType = useMemo(
    () => ({
      ticker,
      days,
      stockData,
      stockLoading,
      stockError: stockError as Error | null,
      newsData,
      newsLoading,
      newsError: newsError as Error | null,
      sentimentData,
      sentimentLoading,
      sentimentError: sentimentError as Error | null,
      articleSentimentData,
      articleSentimentLoading,
      articleSentimentError: articleSentimentError as Error | null,
      isSentimentPolling,
      sentimentJobId,
      sentimentJobStatus,
      triggerSentimentAnalysis: triggerAnalysis,
      cancelSentimentPolling: cancelPolling,
    }),
    [
      ticker,
      days,
      stockData,
      stockLoading,
      stockError,
      newsData,
      newsLoading,
      newsError,
      sentimentData,
      sentimentLoading,
      sentimentError,
      articleSentimentData,
      articleSentimentLoading,
      articleSentimentError,
      isSentimentPolling,
      sentimentJobId,
      sentimentJobStatus,
      triggerAnalysis,
      cancelPolling,
    ]
  );

  return (
    <StockDetailContext.Provider value={value}>
      {children}
    </StockDetailContext.Provider>
  );
}

export function useStockDetail() {
  const context = useContext(StockDetailContext);
  if (context === undefined) {
    throw new Error('useStockDetail must be used within a StockDetailProvider');
  }
  return context;
}
