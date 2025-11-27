import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { usePortfolioBatchData } from '@/hooks/usePortfolioBatchData';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fetchBatchStocks, fetchBatchNews, fetchBatchSentiment } from '@/services/api/batch.service';

// Mock dependencies
jest.mock('@/services/api/batch.service');

const mockFetchBatchStocks = fetchBatchStocks as jest.Mock;
const mockFetchBatchNews = fetchBatchNews as jest.Mock;
const mockFetchBatchSentiment = fetchBatchSentiment as jest.Mock;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('usePortfolioBatchData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch data for tickers', async () => {
    const tickers = ['AAPL', 'GOOGL'];

    mockFetchBatchStocks.mockResolvedValue({ data: { AAPL: [], GOOGL: [] }, errors: {} });
    mockFetchBatchNews.mockResolvedValue({ data: { AAPL: [], GOOGL: [] }, errors: {} });
    mockFetchBatchSentiment.mockResolvedValue({ data: { AAPL: [], GOOGL: [] }, errors: {} });

    const { result } = renderHook(() => usePortfolioBatchData(tickers), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockFetchBatchStocks).toHaveBeenCalled();
    expect(mockFetchBatchNews).toHaveBeenCalled();
    expect(mockFetchBatchSentiment).toHaveBeenCalled();
    expect(result.current.data).toBeDefined();
    expect(result.current.data?.stocks.AAPL).toBeDefined();
  });

  it('should chunk tickers into batches', async () => {
    const tickers = Array.from({ length: 15 }, (_, i) => `T${i}`); // 15 tickers

    mockFetchBatchStocks.mockResolvedValue({ data: {}, errors: {} });
    mockFetchBatchNews.mockResolvedValue({ data: {}, errors: {} });
    mockFetchBatchSentiment.mockResolvedValue({ data: {}, errors: {} });

    const { result } = renderHook(() => usePortfolioBatchData(tickers), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Should call APIs twice (10 + 5)
    expect(mockFetchBatchStocks).toHaveBeenCalledTimes(2);
    expect(mockFetchBatchNews).toHaveBeenCalledTimes(2);
    expect(mockFetchBatchSentiment).toHaveBeenCalledTimes(2);
  });

  it('should handle partial errors', async () => {
    const tickers = ['AAPL'];

    mockFetchBatchStocks.mockResolvedValue({ data: { AAPL: [] }, errors: {} });
    mockFetchBatchNews.mockRejectedValue(new Error('News failed'));
    mockFetchBatchSentiment.mockResolvedValue({ data: { AAPL: [] }, errors: {} });

    const { result } = renderHook(() => usePortfolioBatchData(tickers), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Even if news fails, we should get other data
    expect(result.current.data?.stocks.AAPL).toBeDefined();
    // And news should be null/empty but not crash
    expect(result.current.data?.news.AAPL).toBeUndefined();
  });
});
