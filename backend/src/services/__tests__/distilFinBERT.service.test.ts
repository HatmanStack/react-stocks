/**
 * DistilFinBERT Client Service Tests
 *
 * Tests HTTP client functionality including:
 * - Successful requests
 * - Retry logic with exponential backoff
 * - Error handling (network, timeout, server errors)
 * - Response validation
 * - Fallback behavior
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock axios module with ESM-compatible mocking using unstable_mockModule
const mockAxiosPost = jest.fn<any>();
const mockAxiosGet = jest.fn<any>();

jest.unstable_mockModule('axios', () => ({
  default: {
    post: mockAxiosPost,
    get: mockAxiosGet,
    isAxiosError: (payload: any) => payload?.isAxiosError === true,
  },
  post: mockAxiosPost,
  get: mockAxiosGet,
  isAxiosError: (payload: any) => payload?.isAxiosError === true,
  AxiosError: class AxiosError extends Error {
    isAxiosError = true;
    code?: string;
    response?: any;
    constructor(message: string) {
      super(message);
    }
  }
}));

// Import the module under test AFTER mocking
const { getDistilFinBERTSentiment, getDistilFinBERTHealth } = await import('../distilFinBERT.service.js');

describe('DistilFinBERT Service', () => {
  // Store original env
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Set test environment
    process.env = {
      ...originalEnv,
      DISTILFINBERT_API_URL: 'https://test-api.example.com',
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = originalEnv;
  });

  describe('getDistilFinBERTSentiment', () => {
    const validResponse = {
      data: {
        sentiment: 0.75,
        confidence: 0.88,
        label: 'positive',
        probabilities: {
          negative: 0.05,
          neutral: 0.07,
          positive: 0.88,
        },
      },
    };

    it('should return sentiment score on successful request', async () => {
      mockAxiosPost.mockResolvedValueOnce(validResponse);

      const result = await getDistilFinBERTSentiment('Earnings beat expectations');

      expect(result).toBe(0.75);
      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://test-api.example.com/sentiment',
        { text: 'Earnings beat expectations' },
        expect.objectContaining({
          timeout: 5000,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should return null if API URL not configured', async () => {
      delete process.env.DISTILFINBERT_API_URL;

      const result = await getDistilFinBERTSentiment('Test text');

      expect(result).toBeNull();
      expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    it('should return null for empty text', async () => {
      const result = await getDistilFinBERTSentiment('');

      expect(result).toBeNull();
      expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    it('should truncate very long text', async () => {
      const longText = 'a'.repeat(10000);
      mockAxiosPost.mockResolvedValueOnce(validResponse);

      await getDistilFinBERTSentiment(longText);

      expect(mockAxiosPost).toHaveBeenCalled();
      const callArgs = mockAxiosPost.mock.calls[0] as any[];
      const textArg = (callArgs[1] as any).text;
      expect(textArg.length).toBeLessThanOrEqual(5000);
    });

    it('should validate sentiment score range', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          ...validResponse.data,
          sentiment: 1.5, // Out of range
        },
      });

      const result = await getDistilFinBERTSentiment('Test text');

      expect(result).toBeNull();
    });

    it('should validate response structure', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          // Missing sentiment field
          label: 'positive',
        },
      });

      const result = await getDistilFinBERTSentiment('Test text');

      expect(result).toBeNull();
    });

    it('should retry on network error and succeed', async () => {
      const networkError: any = new Error('Network Error');
      networkError.isAxiosError = true;
      networkError.code = 'ECONNREFUSED';

      mockAxiosPost
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(validResponse);

      const promise = getDistilFinBERTSentiment('Test text');

      // Fast-forward through retry delays
      await jest.advanceTimersByTimeAsync(1000); // First retry after 1s
      await jest.advanceTimersByTimeAsync(2000); // Second retry after 2s

      const result = await promise;

      expect(result).toBe(0.75);
      expect(mockAxiosPost).toHaveBeenCalledTimes(3);
    });

    it('should retry on timeout error', async () => {
      const timeoutError: any = new Error('Timeout');
      timeoutError.isAxiosError = true;
      timeoutError.code = 'ECONNABORTED';

      mockAxiosPost
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce(validResponse);

      const promise = getDistilFinBERTSentiment('Test text');

      await jest.advanceTimersByTimeAsync(1000);

      const result = await promise;

      expect(result).toBe(0.75);
      expect(mockAxiosPost).toHaveBeenCalledTimes(2);
    });

    it('should retry on 5xx server error', async () => {
      const serverError: any = new Error('Server Error');
      serverError.isAxiosError = true;
      serverError.response = {
        status: 503,
        statusText: 'Service Unavailable',
      };

      mockAxiosPost
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce(validResponse);

      const promise = getDistilFinBERTSentiment('Test text');

      await jest.advanceTimersByTimeAsync(1000);

      const result = await promise;

      expect(result).toBe(0.75);
      expect(mockAxiosPost).toHaveBeenCalledTimes(2);
    });

    it('should NOT retry on 4xx client error', async () => {
      const clientError: any = new Error('Bad Request');
      clientError.isAxiosError = true;
      clientError.response = {
        status: 400,
        statusText: 'Bad Request',
      };

      mockAxiosPost.mockRejectedValueOnce(clientError);

      const result = await getDistilFinBERTSentiment('Test text');

      expect(result).toBeNull();
      expect(mockAxiosPost).toHaveBeenCalledTimes(1); // No retry
    });

    it('should return null after max retries exhausted', async () => {
      const networkError: any = new Error('Network Error');
      networkError.isAxiosError = true;
      networkError.code = 'ECONNREFUSED';

      mockAxiosPost
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError);

      const promise = getDistilFinBERTSentiment('Test text');

      // Fast-forward through all retry delays
      await jest.advanceTimersByTimeAsync(1000); // First retry
      await jest.advanceTimersByTimeAsync(2000); // Second retry

      const result = await promise;

      expect(result).toBeNull();
      expect(mockAxiosPost).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff for retries', async () => {
      const networkError: any = new Error('Network Error');
      networkError.isAxiosError = true;

      mockAxiosPost
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(validResponse);

      const promise = getDistilFinBERTSentiment('Test text');

      // Advance through retries with exponential backoff
      await jest.advanceTimersByTimeAsync(1000); // 1st retry: 1s delay
      await jest.advanceTimersByTimeAsync(2000); // 2nd retry: 2s delay (exponential backoff)

      await promise;

      // Verify exponential backoff timing
      expect(mockAxiosPost).toHaveBeenCalledTimes(3);
      // Total delay: 1s + 2s = 3s (exponential: 2^0=1s, 2^1=2s)
    });

    it('should handle negative sentiment scores', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          sentiment: -0.65,
          confidence: 0.82,
          label: 'negative',
          probabilities: {
            negative: 0.82,
            neutral: 0.10,
            positive: 0.08,
          },
        },
      });

      const result = await getDistilFinBERTSentiment('Stock drops on guidance miss');

      expect(result).toBe(-0.65);
    });

    it('should handle neutral sentiment scores', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          sentiment: 0.02,
          confidence: 0.55,
          label: 'neutral',
          probabilities: {
            negative: 0.25,
            neutral: 0.55,
            positive: 0.20,
          },
        },
      });

      const result = await getDistilFinBERTSentiment('Results in line with expectations');

      expect(result).toBe(0.02);
    });
  });

  describe('getDistilFinBERTHealth', () => {
    it('should return health status on success', async () => {
      const healthResponse = {
        data: {
          status: 'healthy',
          model_loaded: true,
        },
      };

      mockAxiosGet.mockResolvedValueOnce(healthResponse);

      const result = await getDistilFinBERTHealth();

      expect(result).toEqual({
        status: 'healthy',
        model_loaded: true,
      });
      expect(mockAxiosGet).toHaveBeenCalledWith(
        'https://test-api.example.com/health',
        { timeout: 3000 }
      );
    });

    it('should return null if API URL not configured', async () => {
      delete process.env.DISTILFINBERT_API_URL;

      const result = await getDistilFinBERTHealth();

      expect(result).toBeNull();
      expect(mockAxiosGet).not.toHaveBeenCalled();
    });

    it('should return null on health check failure', async () => {
      mockAxiosGet.mockRejectedValueOnce(new Error('Service down'));

      const result = await getDistilFinBERTHealth();

      expect(result).toBeNull();
    });
  });
});
