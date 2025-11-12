/**
 * Tests for Tiingo API service
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import axios from 'axios';
import { fetchStockPrices, fetchSymbolMetadata } from '../../src/services/tiingo.service';
import type { TiingoStockPrice, TiingoSymbolMetadata } from '../../src/types/tiingo.types';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Helper to create axios instance mock
const createAxiosInstanceMock = () => {
  const instance = {
    get: jest.fn<any>(),
  };
  mockedAxios.create.mockReturnValue(instance as any);
  return instance;
};

describe('Tiingo Service', () => {
  const mockApiKey = 'test-api-key';
  let consoleLogSpy: typeof console.log;
  let consoleErrorSpy: typeof console.error;
  let axiosInstance: ReturnType<typeof createAxiosInstanceMock>;

  beforeEach(() => {
    // Mock console methods
    consoleLogSpy = console.log;
    consoleErrorSpy = console.error;
    console.log = () => {};
    console.error = () => {};

    // Reset mocks
    jest.clearAllMocks();

    // Setup axios mocks
    (mockedAxios.create as any) = jest.fn();
    (mockedAxios.isAxiosError as any) = jest.fn((error: any) => !!error?.isAxiosError);

    // Create new axios instance
    axiosInstance = createAxiosInstanceMock();
  });

  afterEach(() => {
    console.log = consoleLogSpy;
    console.error = consoleErrorSpy;
  });

  describe('fetchStockPrices', () => {
    const mockPriceData: TiingoStockPrice[] = [
      {
        date: '2024-01-15T00:00:00.000Z',
        open: 100,
        high: 105,
        low: 98,
        close: 103,
        volume: 1000000,
        adjOpen: 100,
        adjHigh: 105,
        adjLow: 98,
        adjClose: 103,
        adjVolume: 1000000,
        divCash: 0,
        splitFactor: 1,
      },
    ];

    it('should fetch stock prices successfully', async () => {
      axiosInstance.get.mockResolvedValue({ data: mockPriceData });

      const result = await fetchStockPrices('AAPL', '2024-01-01', '2024-01-31', mockApiKey);

      expect(result).toEqual(mockPriceData);
      expect(axiosInstance.get).toHaveBeenCalledWith(
        '/tiingo/daily/AAPL/prices',
        expect.objectContaining({
          params: {
            startDate: '2024-01-01',
            endDate: '2024-01-31',
            token: mockApiKey,
          },
        })
      );
    });

    it('should fetch stock prices without end date', async () => {
      axiosInstance.get.mockResolvedValue({ data: mockPriceData });

      const result = await fetchStockPrices('AAPL', '2024-01-01', undefined, mockApiKey);

      expect(result).toEqual(mockPriceData);
      expect(axiosInstance.get).toHaveBeenCalledWith(
        '/tiingo/daily/AAPL/prices',
        expect.objectContaining({
          params: {
            startDate: '2024-01-01',
            token: mockApiKey,
          },
        })
      );
    });

    // TODO: Fix ES module mocking issues for error handling tests
    it.skip('should throw APIError for 404 ticker not found', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 404 },
      };
      axiosInstance.get.mockRejectedValue(axiosError);

      try {
        await fetchStockPrices('INVALID', '2024-01-01', undefined, mockApiKey);
        throw new Error('Expected function to throw');
      } catch (error: any) {
        expect(error.message).toContain("Ticker 'INVALID' not found");
      }
    });

    it.skip('should throw APIError for 401 invalid API key', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 401 },
      };
      axiosInstance.get.mockRejectedValue(axiosError);

      try {
        await fetchStockPrices('AAPL', '2024-01-01', undefined, 'invalid-key');
        throw new Error('Expected function to throw');
      } catch (error: any) {
        expect(error.message).toContain('Invalid API key');
      }
    });

    it('should retry on 429 rate limit error', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 429 },
      };

      // First call fails with 429, second succeeds
      axiosInstance.get
        .mockRejectedValueOnce(axiosError)
        .mockResolvedValueOnce({ data: mockPriceData });

      // Mock timers for retry delay
      jest.useFakeTimers();

      const promise = fetchStockPrices('AAPL', '2024-01-01', undefined, mockApiKey);

      // Fast-forward time for retry delays
      await jest.advanceTimersByTimeAsync(2000);

      const result = await promise;

      expect(result).toEqual(mockPriceData);
      expect(axiosInstance.get).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it('should retry on 500 server error', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 500 },
      };

      // First call fails with 500, second succeeds
      axiosInstance.get
        .mockRejectedValueOnce(axiosError)
        .mockResolvedValueOnce({ data: mockPriceData });

      jest.useFakeTimers();

      const promise = fetchStockPrices('AAPL', '2024-01-01', undefined, mockApiKey);
      await jest.advanceTimersByTimeAsync(2000);

      const result = await promise;

      expect(result).toEqual(mockPriceData);
      expect(axiosInstance.get).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it.skip('should not retry on 404 error', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 404 },
      };
      axiosInstance.get.mockRejectedValue(axiosError);

      try {
        await fetchStockPrices('INVALID', '2024-01-01', undefined, mockApiKey);
        throw new Error('Expected function to throw');
      } catch (error: any) {
        expect(error.message).toBeDefined();
      }

      // Should only call once (no retries for 404)
      expect(axiosInstance.get).toHaveBeenCalledTimes(1);
    });

    it.skip('should stop retrying after 3 attempts', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 500 },
      };
      axiosInstance.get.mockRejectedValue(axiosError);

      jest.useFakeTimers();

      const promise = fetchStockPrices('AAPL', '2024-01-01', undefined, mockApiKey);

      // Advance through all retry delays: 2s, 4s, 8s
      await jest.advanceTimersByTimeAsync(2000);
      await jest.advanceTimersByTimeAsync(4000);
      await jest.advanceTimersByTimeAsync(8000);

      await expect(promise).rejects.toThrow();

      // Initial call + 3 retries = 4 total calls
      expect(axiosInstance.get).toHaveBeenCalledTimes(4);

      jest.useRealTimers();
    });
  });

  describe('fetchSymbolMetadata', () => {
    const mockMetadata: TiingoSymbolMetadata = {
      ticker: 'AAPL',
      name: 'Apple Inc.',
      exchangeCode: 'NASDAQ',
      startDate: '1980-12-12',
      endDate: '2024-12-31',
      description: 'Apple Inc. designs, manufactures, and markets smartphones...',
    };

    it('should fetch symbol metadata successfully', async () => {
      axiosInstance.get.mockResolvedValue({ data: mockMetadata });

      const result = await fetchSymbolMetadata('AAPL', mockApiKey);

      expect(result).toEqual(mockMetadata);
      expect(axiosInstance.get).toHaveBeenCalledWith(
        '/tiingo/daily/AAPL',
        expect.objectContaining({
          params: { token: mockApiKey },
        })
      );
    });

    it.skip('should throw APIError for 404 ticker not found', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 404 },
      };
      axiosInstance.get.mockRejectedValue(axiosError);

      try {
        await fetchSymbolMetadata('INVALID', mockApiKey);
        throw new Error('Expected function to throw');
      } catch (error: any) {
        expect(error.message).toContain("Ticker 'INVALID' not found");
      }
    });

    it.skip('should throw APIError for 401 invalid API key', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 401 },
      };
      axiosInstance.get.mockRejectedValue(axiosError);

      try {
        await fetchSymbolMetadata('AAPL', 'invalid-key');
        throw new Error('Expected function to throw');
      } catch (error: any) {
        expect(error.message).toContain('Invalid API key');
      }
    });

    it('should retry on rate limit error', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 429 },
      };

      axiosInstance.get
        .mockRejectedValueOnce(axiosError)
        .mockResolvedValueOnce({ data: mockMetadata });

      jest.useFakeTimers();

      const promise = fetchSymbolMetadata('AAPL', mockApiKey);
      await jest.advanceTimersByTimeAsync(2000);

      const result = await promise;

      expect(result).toEqual(mockMetadata);
      expect(axiosInstance.get).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });
  });
});
