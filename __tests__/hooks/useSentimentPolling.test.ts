/**
 * Unit tests for useSentimentPolling hook
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useSentimentPolling } from '@/hooks/useSentimentPolling';
import * as LambdaSentiment from '@/services/api/lambdaSentiment.service';

// Mock the Lambda Sentiment service
jest.mock('@/services/api/lambdaSentiment.service');

const mockedService = LambdaSentiment as jest.Mocked<typeof LambdaSentiment>;

describe('useSentimentPolling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() =>
      useSentimentPolling('AAPL', '2025-01-01', '2025-01-30')
    );

    expect(result.current.isPolling).toBe(false);
    expect(result.current.jobId).toBeNull();
    expect(result.current.jobStatus).toBeNull();
    expect(result.current.sentimentData).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should trigger analysis and start polling', async () => {
    const mockJobResponse: LambdaSentiment.SentimentJobResponse = {
      jobId: 'AAPL_2025-01-01_2025-01-30',
      status: 'PENDING',
      cached: false,
    };

    mockedService.triggerSentimentAnalysis.mockResolvedValue(mockJobResponse);

    const { result } = renderHook(() =>
      useSentimentPolling('AAPL', '2025-01-01', '2025-01-30')
    );

    await act(async () => {
      await result.current.triggerAnalysis();
    });

    expect(result.current.isPolling).toBe(true);
    expect(result.current.jobId).toBe('AAPL_2025-01-01_2025-01-30');
    expect(mockedService.triggerSentimentAnalysis).toHaveBeenCalledWith({
      ticker: 'AAPL',
      startDate: '2025-01-01',
      endDate: '2025-01-30',
    });
  });

  it('should poll job status and complete successfully', async () => {
    const mockJobResponse: LambdaSentiment.SentimentJobResponse = {
      jobId: 'AAPL_2025-01-01_2025-01-30',
      status: 'PENDING',
      cached: false,
    };

    const mockStatusInProgress: LambdaSentiment.SentimentJobStatus = {
      jobId: 'AAPL_2025-01-01_2025-01-30',
      status: 'IN_PROGRESS',
      ticker: 'AAPL',
      startDate: '2025-01-01',
      endDate: '2025-01-30',
      articlesProcessed: 10,
      cached: false,
    };

    const mockStatusCompleted: LambdaSentiment.SentimentJobStatus = {
      jobId: 'AAPL_2025-01-01_2025-01-30',
      status: 'COMPLETED',
      ticker: 'AAPL',
      startDate: '2025-01-01',
      endDate: '2025-01-30',
      articlesProcessed: 25,
      cached: false,
    };

    const mockResults: LambdaSentiment.SentimentResultsResponse = {
      ticker: 'AAPL',
      startDate: '2025-01-01',
      endDate: '2025-01-30',
      dailySentiment: [
        {
          date: '2025-01-15',
          positive: 45,
          negative: 12,
          sentimentScore: 0.65,
          classification: 'POS',
        },
      ],
      cached: false,
    };

    mockedService.triggerSentimentAnalysis.mockResolvedValue(mockJobResponse);
    mockedService.getSentimentJobStatus
      .mockResolvedValueOnce(mockStatusInProgress)
      .mockResolvedValueOnce(mockStatusCompleted);
    mockedService.getSentimentResults.mockResolvedValue(mockResults);

    const onComplete = jest.fn();

    const { result } = renderHook(() =>
      useSentimentPolling('AAPL', '2025-01-01', '2025-01-30', {
        onComplete,
      })
    );

    // Trigger analysis
    await act(async () => {
      await result.current.triggerAnalysis();
    });

    expect(result.current.isPolling).toBe(true);

    // First poll - IN_PROGRESS
    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(result.current.jobStatus?.status).toBe('IN_PROGRESS');

    // Second poll - COMPLETED
    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.isPolling).toBe(false);
      expect(result.current.sentimentData).toHaveLength(1);
      expect(onComplete).toHaveBeenCalledWith(mockResults.dailySentiment);
    });
  });

  it('should handle cached (immediate) completion', async () => {
    const mockJobResponse: LambdaSentiment.SentimentJobResponse = {
      jobId: 'AAPL_2025-01-01_2025-01-30',
      status: 'COMPLETED',
      cached: true,
    };

    const mockResults: LambdaSentiment.SentimentResultsResponse = {
      ticker: 'AAPL',
      startDate: '2025-01-01',
      endDate: '2025-01-30',
      dailySentiment: [
        {
          date: '2025-01-15',
          positive: 45,
          negative: 12,
          sentimentScore: 0.65,
          classification: 'POS',
        },
      ],
      cached: true,
    };

    mockedService.triggerSentimentAnalysis.mockResolvedValue(mockJobResponse);
    mockedService.getSentimentResults.mockResolvedValue(mockResults);

    const onComplete = jest.fn();

    const { result } = renderHook(() =>
      useSentimentPolling('AAPL', '2025-01-01', '2025-01-30', {
        onComplete,
      })
    );

    await act(async () => {
      await result.current.triggerAnalysis();
    });

    await waitFor(() => {
      expect(result.current.isPolling).toBe(false);
      expect(result.current.sentimentData).toHaveLength(1);
      expect(onComplete).toHaveBeenCalledWith(mockResults.dailySentiment);
    });
  });

  it('should handle failed job status', async () => {
    const mockJobResponse: LambdaSentiment.SentimentJobResponse = {
      jobId: 'AAPL_2025-01-01_2025-01-30',
      status: 'PENDING',
      cached: false,
    };

    const mockStatusFailed: LambdaSentiment.SentimentJobStatus = {
      jobId: 'AAPL_2025-01-01_2025-01-30',
      status: 'FAILED',
      ticker: 'AAPL',
      startDate: '2025-01-01',
      endDate: '2025-01-30',
      error: 'Failed to fetch news articles',
      cached: false,
    };

    mockedService.triggerSentimentAnalysis.mockResolvedValue(mockJobResponse);
    mockedService.getSentimentJobStatus.mockResolvedValue(mockStatusFailed);

    const onError = jest.fn();

    const { result } = renderHook(() =>
      useSentimentPolling('AAPL', '2025-01-01', '2025-01-30', {
        onError,
      })
    );

    await act(async () => {
      await result.current.triggerAnalysis();
    });

    await waitFor(() => {
      expect(result.current.isPolling).toBe(false);
      expect(result.current.error).toBeDefined();
      expect(result.current.error?.message).toBe('Failed to fetch news articles');
      expect(onError).toHaveBeenCalled();
    });
  });

  it('should timeout after max attempts', async () => {
    const mockJobResponse: LambdaSentiment.SentimentJobResponse = {
      jobId: 'AAPL_2025-01-01_2025-01-30',
      status: 'PENDING',
      cached: false,
    };

    const mockStatusInProgress: LambdaSentiment.SentimentJobStatus = {
      jobId: 'AAPL_2025-01-01_2025-01-30',
      status: 'IN_PROGRESS',
      ticker: 'AAPL',
      startDate: '2025-01-01',
      endDate: '2025-01-30',
      cached: false,
    };

    mockedService.triggerSentimentAnalysis.mockResolvedValue(mockJobResponse);
    mockedService.getSentimentJobStatus.mockResolvedValue(mockStatusInProgress);

    const onError = jest.fn();

    const { result } = renderHook(() =>
      useSentimentPolling('AAPL', '2025-01-01', '2025-01-30', {
        maxAttempts: 3,
        onError,
      })
    );

    await act(async () => {
      await result.current.triggerAnalysis();
    });

    // Poll 3 times
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
      });
    }

    await waitFor(() => {
      expect(result.current.isPolling).toBe(false);
      expect(result.current.error).toBeDefined();
      expect(result.current.error?.message).toContain('timed out');
      expect(onError).toHaveBeenCalled();
    });
  });

  it('should cancel polling when requested', async () => {
    const mockJobResponse: LambdaSentiment.SentimentJobResponse = {
      jobId: 'AAPL_2025-01-01_2025-01-30',
      status: 'PENDING',
      cached: false,
    };

    mockedService.triggerSentimentAnalysis.mockResolvedValue(mockJobResponse);

    const { result } = renderHook(() =>
      useSentimentPolling('AAPL', '2025-01-01', '2025-01-30')
    );

    await act(async () => {
      await result.current.triggerAnalysis();
    });

    expect(result.current.isPolling).toBe(true);

    act(() => {
      result.current.cancelPolling();
    });

    expect(result.current.isPolling).toBe(false);
  });

  it('should cleanup on unmount', async () => {
    const mockJobResponse: LambdaSentiment.SentimentJobResponse = {
      jobId: 'AAPL_2025-01-01_2025-01-30',
      status: 'PENDING',
      cached: false,
    };

    mockedService.triggerSentimentAnalysis.mockResolvedValue(mockJobResponse);

    const { result, unmount } = renderHook(() =>
      useSentimentPolling('AAPL', '2025-01-01', '2025-01-30')
    );

    await act(async () => {
      await result.current.triggerAnalysis();
    });

    expect(result.current.isPolling).toBe(true);

    unmount();

    // Polling should be cleaned up (no error should be thrown)
    expect(() => jest.advanceTimersByTime(2000)).not.toThrow();
  });

  it('should handle errors during trigger', async () => {
    const mockError = new Error('Network error');
    mockedService.triggerSentimentAnalysis.mockRejectedValue(mockError);

    const onError = jest.fn();

    const { result } = renderHook(() =>
      useSentimentPolling('AAPL', '2025-01-01', '2025-01-30', {
        onError,
      })
    );

    await act(async () => {
      await result.current.triggerAnalysis();
    });

    expect(result.current.error).toBeDefined();
    expect(result.current.error?.message).toBe('Network error');
    expect(onError).toHaveBeenCalledWith(mockError);
  });
});
