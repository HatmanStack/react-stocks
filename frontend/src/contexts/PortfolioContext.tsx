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

  // Use batch loading if we have more than 3 tickers
  // (For small portfolios, individual queries might be fine or handled by existing logic,
  // but using batch for >3 is consistent with the plan)
  const shouldUseBatch = tickers.length > 3;

  // Always call the hook, but it will be disabled if empty.
  // Note: We can pass `tickers` directly. The hook handles empty array.
  // However, we want to conditionally enable it based on portfolio size?
  // The plan says: "When portfolio >3 tickers, use batch loading"
  // But we can just use it for all sizes if efficient.
  // Let's stick to the plan: "When portfolio <=3 tickers, use existing single-ticker loading (less overhead)"
  // Wait, if we don't call batch hook, we don't get batchData.
  // If we use single-ticker loading in components, they need to know whether to look at batchData or fetch individually.
  // Components will consume PortfolioContext.

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
