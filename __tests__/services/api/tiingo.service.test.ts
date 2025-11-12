/**
 * Unit tests for Tiingo API Service (Lambda Backend)
 */

import axios from 'axios';
import {
  fetchStockPrices,
  fetchSymbolMetadata,
  transformTiingoToStockDetails,
  transformTiingoToSymbolDetails,
} from '@/services/api/tiingo.service';
import type { TiingoStockPrice, TiingoSymbolMetadata } from '@/services/api/tiingo.types';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock environment configuration
jest.mock('@/config/environment', () => ({
  Environment: {
    BACKEND_URL: 'https://test-api.execute-api.us-east-1.amazonaws.com',
    USE_BROWSER_SENTIMENT: false,
    USE_BROWSER_PREDICTION: false,
  },
}));

describe('Tiingo Service', () => {
  let mockAxiosInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock axios instance
    mockAxiosInstance = {
      get: jest.fn(),
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);

    // Mock axios.isAxiosError
    (mockedAxios.isAxiosError as unknown as jest.Mock) = jest.fn((error: any) => {
      return error && error.isAxiosError === true;
    });
  });

  describe('fetchStockPrices', () => {
    it('should fetch stock prices for valid ticker from Lambda backend', async () => {
      const mockResponse: TiingoStockPrice[] = [
        {
          date: '2025-01-15T00:00:00.000Z',
          open: 150.0,
          high: 152.5,
          low: 149.0,
          close: 151.5,
          volume: 1000000,
          adjOpen: 150.0,
          adjHigh: 152.5,
          adjLow: 149.0,
          adjClose: 151.5,
          adjVolume: 1000000,
          divCash: 0,
          splitFactor: 1,
        },
      ];

      mockAxiosInstance.get.mockResolvedValue({ data: mockResponse });

      const result = await fetchStockPrices('AAPL', '2025-01-15', '2025-01-15');

      expect(result).toEqual(mockResponse);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/stocks',
        {
          params: {
            ticker: 'AAPL',
            startDate: '2025-01-15',
            endDate: '2025-01-15',
            type: 'prices',
          },
        }
      );
    });

    it('should handle ticker not found (404)', async () => {
      const axiosError = new Error("Ticker 'INVALID' not found");
      Object.assign(axiosError, {
        isAxiosError: true,
        response: { status: 404 },
      });

      mockAxiosInstance.get.mockRejectedValue(axiosError);

      await expect(fetchStockPrices('INVALID', '2025-01-15')).rejects.toThrow(
        "Ticker 'INVALID' not found"
      );
    });

    it('should handle rate limiting (429)', async () => {
      const axiosError = new Error('Rate limit exceeded');
      Object.assign(axiosError, {
        isAxiosError: true,
        response: { status: 429 },
      });

      mockAxiosInstance.get.mockRejectedValue(axiosError);

      await expect(fetchStockPrices('AAPL', '2025-01-15')).rejects.toThrow(
        'Rate limit exceeded'
      );
    });

    it('should handle invalid request (400)', async () => {
      const axiosError = new Error('Invalid request parameters');
      Object.assign(axiosError, {
        isAxiosError: true,
        response: { status: 400, data: { error: 'Invalid ticker format' } },
      });

      mockAxiosInstance.get.mockRejectedValue(axiosError);

      await expect(fetchStockPrices('AAPL', '2025-01-15')).rejects.toThrow(
        'Invalid ticker format'
      );
    });

    it('should handle backend errors (500)', async () => {
      const axiosError = new Error('Backend service error');
      Object.assign(axiosError, {
        isAxiosError: true,
        response: { status: 500, data: { error: 'Tiingo API unavailable' } },
      });

      mockAxiosInstance.get.mockRejectedValue(axiosError);

      await expect(fetchStockPrices('AAPL', '2025-01-15')).rejects.toThrow(
        'Tiingo API unavailable'
      );
    });

    it('should not include endDate param when not provided', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      await fetchStockPrices('AAPL', '2025-01-15');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/stocks',
        {
          params: {
            ticker: 'AAPL',
            startDate: '2025-01-15',
            type: 'prices',
          },
        }
      );
    });
  });

  describe('fetchSymbolMetadata', () => {
    it('should fetch symbol metadata for valid ticker from Lambda backend', async () => {
      const mockMetadata: TiingoSymbolMetadata = {
        ticker: 'AAPL',
        name: 'Apple Inc.',
        exchangeCode: 'NASDAQ',
        startDate: '1980-12-12',
        endDate: '2025-12-31',
        description: 'Apple Inc. designs and manufactures consumer electronics.',
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockMetadata });

      const result = await fetchSymbolMetadata('AAPL');

      expect(result).toEqual(mockMetadata);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/stocks', {
        params: { ticker: 'AAPL', type: 'metadata' },
      });
    });

    it('should handle ticker not found (404)', async () => {
      const axiosError = new Error("Ticker 'INVALID' not found");
      Object.assign(axiosError, {
        isAxiosError: true,
        response: { status: 404 },
      });

      mockAxiosInstance.get.mockRejectedValue(axiosError);

      await expect(fetchSymbolMetadata('INVALID')).rejects.toThrow(
        "Ticker 'INVALID' not found"
      );
    });
  });

  describe('transformTiingoToStockDetails', () => {
    it('should transform Tiingo response to StockDetails format', () => {
      const tiingoPrice: TiingoStockPrice = {
        date: '2025-01-15T00:00:00.000Z',
        open: 150.123,
        high: 152.789,
        low: 149.456,
        close: 151.555,
        volume: 1234567,
        adjOpen: 150.123,
        adjHigh: 152.789,
        adjLow: 149.456,
        adjClose: 151.555,
        adjVolume: 1234567,
        divCash: 0,
        splitFactor: 1,
      };

      const result = transformTiingoToStockDetails(tiingoPrice, 'AAPL');

      expect(result.ticker).toBe('AAPL');
      expect(result.date).toBe('2025-01-15');
      expect(result.open).toBe(150.12);
      expect(result.high).toBe(152.79);
      expect(result.low).toBe(149.46);
      expect(result.close).toBe(151.56);
      expect(result.volume).toBe(1234567);
    });

    it('should extract date correctly (first 10 characters)', () => {
      const tiingoPrice: TiingoStockPrice = {
        date: '2025-01-15T14:30:00.000Z',
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        volume: 1000,
        adjOpen: 100,
        adjHigh: 105,
        adjLow: 95,
        adjClose: 102,
        adjVolume: 1000,
        divCash: 0,
        splitFactor: 1,
      };

      const result = transformTiingoToStockDetails(tiingoPrice, 'TEST');

      expect(result.date).toBe('2025-01-15');
    });

    it('should round prices to 2 decimal places', () => {
      const tiingoPrice: TiingoStockPrice = {
        date: '2025-01-15T00:00:00.000Z',
        open: 100.999,
        high: 101.001,
        low: 99.004,
        close: 100.505,
        volume: 1000,
        adjOpen: 100.999,
        adjHigh: 101.001,
        adjLow: 99.004,
        adjClose: 100.505,
        adjVolume: 1000,
        divCash: 0,
        splitFactor: 1,
      };

      const result = transformTiingoToStockDetails(tiingoPrice, 'TEST');

      expect(result.open).toBe(101.0);
      expect(result.high).toBe(101.0);
      expect(result.low).toBe(99.0);
      expect(result.close).toBe(100.51);
    });
  });

  describe('transformTiingoToSymbolDetails', () => {
    it('should transform Tiingo metadata to SymbolDetails format', () => {
      const tiingoMetadata: TiingoSymbolMetadata = {
        ticker: 'AAPL',
        name: 'Apple Inc.',
        exchangeCode: 'NASDAQ',
        startDate: '1980-12-12',
        endDate: '2025-12-31',
        description: 'Apple Inc. designs and manufactures consumer electronics.',
      };

      const result = transformTiingoToSymbolDetails(tiingoMetadata);

      expect(result.ticker).toBe('AAPL');
      expect(result.name).toBe('Apple Inc.');
      expect(result.exchangeCode).toBe('NASDAQ');
      expect(result.startDate).toBe('1980-12-12');
      expect(result.endDate).toBe('2025-12-31');
      expect(result.longDescription).toBe(
        'Apple Inc. designs and manufactures consumer electronics.'
      );
    });
  });
});
