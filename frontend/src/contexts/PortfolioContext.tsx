/**
 * Portfolio Context
 * Global state for portfolio stocks
 */

import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import { usePortfolio } from '../hooks/usePortfolio';
import { usePortfolioBatchData } from '../hooks/usePortfolioBatchData';
import type { PortfolioDetails } from '../types/database.types';

interface PortfolioContextType {
  portfolio: PortfolioDetails[];
  isLoading: boolean;
  error: Error | null;
  isInPortfolio: (ticker: string) => boolean;
  addToPortfolio: (ticker: string) => Promise<void>;
  removeFromPortfolio: (ticker: string) => Promise<void>;
  refetch: () => void;
  batchData?: {
    stocks: Record<string, any>;
    news: Record<string, any>;
    sentiment: Record<string, any>;
    errors: Record<string, string>;
  };
  isLoadingBatch: boolean;
}

const PortfolioContext = createContext<PortfolioContextType | undefined>(undefined);

interface PortfolioProviderProps {
  children: ReactNode;
}

export function PortfolioProvider({ children }: PortfolioProviderProps) {
  const portfolioHook = usePortfolio();

  // Get list of tickers for batch loading
  const tickers = useMemo(() => {
    return portfolioHook.portfolio.map((item) => item.ticker);
  }, [portfolioHook.portfolio]);

  // Use batch loading for portfolios with >3 tickers to reduce API calls
  const shouldUseBatch = tickers.length > 3;
  const { data: batchData, isLoading: isLoadingBatch } = usePortfolioBatchData(shouldUseBatch ? tickers : []);

  const isInPortfolio = (ticker: string): boolean => {
    return portfolioHook.portfolio.some((item: PortfolioDetails) => item.ticker === ticker);
  };

  const addToPortfolio = async (ticker: string): Promise<void> => {
    try {
      console.log('[PortfolioContext] Adding to portfolio:', ticker);

      // Create portfolio entry with default prediction values
      const portfolioEntry: Omit<PortfolioDetails, 'id'> = {
        ticker,
        name: ticker, // Will be updated when data syncs
        next: '0',
        wks: '0',
        mnth: '0',
      };

      await portfolioHook.addToPortfolio.mutateAsync(portfolioEntry as PortfolioDetails);
    } catch (error) {
      console.error('[PortfolioContext] Error adding to portfolio:', error);
      throw error;
    }
  };

  const removeFromPortfolio = async (ticker: string): Promise<void> => {
    try {
      console.log('[PortfolioContext] Removing from portfolio:', ticker);
      await portfolioHook.removeFromPortfolio.mutateAsync(ticker);
    } catch (error) {
      console.error('[PortfolioContext] Error removing from portfolio:', error);
      throw error;
    }
  };

  const value: PortfolioContextType = {
    portfolio: portfolioHook.portfolio,
    isLoading: portfolioHook.isLoading,
    error: portfolioHook.error as Error | null,
    isInPortfolio,
    addToPortfolio,
    removeFromPortfolio,
    refetch: portfolioHook.refetch,
    batchData,
    isLoadingBatch: shouldUseBatch ? isLoadingBatch : false,
  };

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

export function usePortfolioContext() {
  const context = useContext(PortfolioContext);
  if (context === undefined) {
    throw new Error('usePortfolioContext must be used within a PortfolioProvider');
  }
  return context;
}
