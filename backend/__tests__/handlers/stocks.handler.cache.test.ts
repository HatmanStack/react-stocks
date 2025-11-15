/**
 * Integration tests for stocks handler with DynamoDB caching
 * Tests the three-tier lookup pattern: Cache → API → Cache result
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handleStocksRequest } from '../../src/handlers/stocks.handler';
import type { TiingoStockPrice } from '../../src/types/tiingo.types';

// Mock the repositories and services
import * as stocksCacheRepo from '../../src/repositories/stocksCache.repository';
import * as tiingoService from '../../src/services/tiingo.service';

// Create mock functions with proper types
const mockQueryStocksByDateRange = jest.fn<typeof stocksCacheRepo.queryStocksByDateRange>();
const mockBatchPutStocks = jest.fn<typeof stocksCacheRepo.batchPutStocks>();
const mockFetchStockPrices = jest.fn<typeof tiingoService.fetchStockPrices>();
const mockFetchSymbolMetadata = jest.fn<typeof tiingoService.fetchSymbolMetadata>();

// Mock the modules
jest.mock('../../src/repositories/stocksCache.repository', () => ({
  queryStocksByDateRange: mockQueryStocksByDateRange,
  batchPutStocks: mockBatchPutStocks,
}));

jest.mock('../../src/services/tiingo.service', () => ({
  fetchStockPrices: mockFetchStockPrices,
  fetchSymbolMetadata: mockFetchSymbolMetadata,
}));

describe('Stocks Handler Integration Tests', () => {
  let consoleLogSpy: typeof console.log;
  let consoleErrorSpy: typeof console.error;
  let consoleWarnSpy: typeof console.warn;

  // Helper to create mock event
  function createMockEvent(queryParams?: Record<string, string>): APIGatewayProxyEventV2 {
    return {
      rawPath: '/stocks',
      requestContext: {
        requestId: 'test-request-id',
        http: {
          method: 'GET',
          path: '/stocks',
          protocol: 'HTTP/1.1',
          sourceIp: '127.0.0.1',
          userAgent: 'test-agent',
        },
        accountId: 'test-account',
        apiId: 'test-api',
        domainName: 'test.execute-api.us-east-1.amazonaws.com',
        domainPrefix: 'test',
        stage: '$default',
        time: '01/Jan/2024:00:00:00 +0000',
        timeEpoch: 1704067200000,
      },
      queryStringParameters: queryParams,
      headers: {},
      isBase64Encoded: false,
      rawQueryString: queryParams
        ? Object.entries(queryParams)
            .map(([k, v]) => `${k}=${v}`)
            .join('&')
        : '',
      routeKey: 'GET /stocks',
      version: '2.0',
    } as APIGatewayProxyEventV2;
  }

  // Helper to create mock price data
  function createMockPriceData(dates: string[]): TiingoStockPrice[] {
    return dates.map((date) => ({
      date: `${date}T00:00:00.000Z`,
      open: 150,
      high: 155,
      low: 149,
      close: 154,
      volume: 1000000,
      adjOpen: 150,
      adjHigh: 155,
      adjLow: 149,
      adjClose: 154,
      adjVolume: 1000000,
      divCash: 0,
      splitFactor: 1,
    }));
  }

  beforeEach(() => {
    // Suppress console output
    consoleLogSpy = console.log;
    consoleErrorSpy = console.error;
    consoleWarnSpy = console.warn;
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();

    // Setup environment
    process.env.TIINGO_API_KEY = 'test-api-key';

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    console.log = consoleLogSpy;
    console.error = consoleErrorSpy;
    console.warn = consoleWarnSpy;
    delete process.env.TIINGO_API_KEY;
  });

  describe('Cache Miss Flow', () => {
    it('should fetch from API when cache is empty and cache the result', async () => {
      // Setup: Empty cache
      mockQueryStocksByDateRange.mockResolvedValue([]);

      // Setup: API returns data
      const apiData = createMockPriceData(['2025-01-01', '2025-01-02', '2025-01-03']);
      mockFetchStockPrices.mockResolvedValue(apiData);

      // Setup: Cache write succeeds
      mockBatchPutStocks.mockResolvedValue(undefined);

      const event = createMockEvent({
        ticker: 'AAPL',
        startDate: '2025-01-01',
        endDate: '2025-01-03',
      });

      const response = await handleStocksRequest(event);

      // Verify response
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(3);
      expect(body._meta.cached).toBe(false);
      expect(body._meta.cacheHitRate).toBeLessThan(0.8);

      // Verify cache was checked
      expect(mockQueryStocksByDateRange).toHaveBeenCalledWith('AAPL', '2025-01-01', '2025-01-03');

      // Verify API was called
      expect(mockFetchStockPrices).toHaveBeenCalledWith(
        'AAPL',
        '2025-01-01',
        '2025-01-03',
        'test-api-key'
      );

      // Verify data was cached
      expect(mockBatchPutStocks).toHaveBeenCalled();
      const cachedItems = mockBatchPutStocks.mock.calls[0][0];
      expect(cachedItems).toHaveLength(3);
      expect(cachedItems[0].ticker).toBe('AAPL');
      expect(cachedItems[0].date).toBe('2025-01-01');
    });

    it('should handle cache miss without endDate parameter', async () => {
      mockQueryStocksByDateRange.mockResolvedValue([]);

      const apiData = createMockPriceData(['2025-01-01']);
      mockFetchStockPrices.mockResolvedValue(apiData);
      mockBatchPutStocks.mockResolvedValue(undefined);

      const event = createMockEvent({
        ticker: 'GOOGL',
        startDate: '2025-01-01',
      });

      const response = await handleStocksRequest(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body._meta.cached).toBe(false);
      expect(mockFetchStockPrices).toHaveBeenCalled();
    });
  });

  describe('Cache Hit Flow', () => {
    it('should return cached data when cache hit rate > 80%', async () => {
      // Setup: Cache has all data (100% hit rate)
      const cachedData = [
        {
          ticker: 'AAPL',
          date: '2025-01-01',
          priceData: {
            open: 150,
            high: 155,
            low: 149,
            close: 154,
            volume: 1000000,
            adjOpen: 150,
            adjHigh: 155,
            adjLow: 149,
            adjClose: 154,
            adjVolume: 1000000,
            divCash: 0,
            splitFactor: 1,
          },
          ttl: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
          fetchedAt: Date.now(),
        },
        {
          ticker: 'AAPL',
          date: '2025-01-02',
          priceData: {
            open: 151,
            high: 156,
            low: 150,
            close: 155,
            volume: 1100000,
            adjOpen: 151,
            adjHigh: 156,
            adjLow: 150,
            adjClose: 155,
            adjVolume: 1100000,
            divCash: 0,
            splitFactor: 1,
          },
          ttl: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
          fetchedAt: Date.now(),
        },
      ];

      mockQueryStocksByDateRange.mockResolvedValue(cachedData);

      const event = createMockEvent({
        ticker: 'AAPL',
        startDate: '2025-01-01',
        endDate: '2025-01-02',
      });

      const response = await handleStocksRequest(event);

      // Verify response
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(2);
      expect(body._meta.cached).toBe(true);
      expect(body._meta.cacheHitRate).toBeGreaterThan(0.8);

      // Verify cache was checked
      expect(mockQueryStocksByDateRange).toHaveBeenCalledWith('AAPL', '2025-01-01', '2025-01-02');

      // Verify API was NOT called
      expect(mockFetchStockPrices).not.toHaveBeenCalled();

      // Verify no new data was cached
      expect(mockBatchPutStocks).not.toHaveBeenCalled();
    });

    it.skip('should transform cached data to correct response format', async () => {
      const cachedData = [
        {
          ticker: 'MSFT',
          date: '2025-01-15',
          priceData: {
            open: 350,
            high: 360,
            low: 345,
            close: 358,
            volume: 5000000,
          },
          ttl: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
          fetchedAt: Date.now(),
        },
      ];

      mockQueryStocksByDateRange.mockResolvedValue(cachedData);

      const event = createMockEvent({
        ticker: 'MSFT',
        startDate: '2025-01-15',
        endDate: '2025-01-15',
      });

      const response = await handleStocksRequest(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data[0].date).toBe('2025-01-15T00:00:00.000Z');
      expect(body.data[0].open).toBe(350);
      expect(body.data[0].close).toBe(358);
      expect(body._meta.cached).toBe(true);
    });
  });

  describe('Partial Cache Hit Flow', () => {
    it.skip('should fetch missing dates from API when cache hit rate < 80%', async () => {
      // Setup: Cache has partial data (50% hit rate - 2 out of 4 dates)
      const cachedData = [
        {
          ticker: 'AAPL',
          date: '2025-01-01',
          priceData: {
            open: 150,
            high: 155,
            low: 149,
            close: 154,
            volume: 1000000,
          },
          ttl: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
          fetchedAt: Date.now(),
        },
        {
          ticker: 'AAPL',
          date: '2025-01-02',
          priceData: {
            open: 151,
            high: 156,
            low: 150,
            close: 155,
            volume: 1100000,
          },
          ttl: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
          fetchedAt: Date.now(),
        },
      ];

      mockQueryStocksByDateRange.mockResolvedValue(cachedData);

      // Setup: API returns all data (including what's already cached)
      const apiData = createMockPriceData(['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04']);
      mockFetchStockPrices.mockResolvedValue(apiData);
      mockBatchPutStocks.mockResolvedValue(undefined);

      const event = createMockEvent({
        ticker: 'AAPL',
        startDate: '2025-01-01',
        endDate: '2025-01-04',
      });

      const response = await handleStocksRequest(event);

      // Verify response
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(4);
      expect(body._meta.cached).toBe(false);
      expect(body._meta.cacheHitRate).toBe(0.5); // 2 out of 4 dates cached

      // Verify API was called
      expect(mockFetchStockPrices).toHaveBeenCalled();

      // Verify new data was cached
      expect(mockBatchPutStocks).toHaveBeenCalled();
    });
  });

  describe('Metadata Request Handling', () => {
    it.skip('should fetch metadata without caching (not implemented yet)', async () => {
      const mockMetadata = {
        ticker: 'AAPL',
        name: 'Apple Inc.',
        exchangeCode: 'NASDAQ',
        startDate: '1980-12-12',
        endDate: '2025-01-15',
        description: 'Apple Inc. designs, manufactures, and markets smartphones.',
      };

      mockFetchSymbolMetadata.mockResolvedValue(mockMetadata);

      const event = createMockEvent({
        ticker: 'AAPL',
        type: 'metadata',
      });

      const response = await handleStocksRequest(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toEqual(mockMetadata);
      expect(body._meta.cached).toBe(false); // Metadata not cached in Phase 2

      expect(mockFetchSymbolMetadata).toHaveBeenCalledWith('AAPL', 'test-api-key');
    });
  });

  describe('Error Handling', () => {
    it.skip('should fall back to API if cache check fails', async () => {
      // Setup: Cache throws error
      mockQueryStocksByDateRange.mockRejectedValue(new Error('DynamoDB unavailable'));

      // Setup: API succeeds
      const apiData = createMockPriceData(['2025-01-01']);
      mockFetchStockPrices.mockResolvedValue(apiData);

      const event = createMockEvent({
        ticker: 'AAPL',
        startDate: '2025-01-01',
        endDate: '2025-01-01',
      });

      const response = await handleStocksRequest(event);

      // Verify request succeeded despite cache failure
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(1);
      expect(body._meta.cached).toBe(false);
      expect(body._meta.cacheHitRate).toBe(0);

      // Verify API was called as fallback
      expect(mockFetchStockPrices).toHaveBeenCalled();
    });

    it.skip('should log cache write errors but not fail the request', async () => {
      mockQueryStocksByDateRange.mockResolvedValue([]);

      const apiData = createMockPriceData(['2025-01-01']);
      mockFetchStockPrices.mockResolvedValue(apiData);

      // Setup: Cache write fails
      mockBatchPutStocks.mockRejectedValue(new Error('DynamoDB write failed'));

      const event = createMockEvent({
        ticker: 'AAPL',
        startDate: '2025-01-01',
        endDate: '2025-01-01',
      });

      const response = await handleStocksRequest(event);

      // Verify request still succeeded
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(1);

      // Verify error was logged
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('[StocksHandler] Failed to cache stock prices'),
        expect.any(Error)
      );
    });
  });

  describe('Response Format', () => {
    it.skip('should include all required cache metadata fields', async () => {
      mockQueryStocksByDateRange.mockResolvedValue([]);
      const apiData = createMockPriceData(['2025-01-01']);
      mockFetchStockPrices.mockResolvedValue(apiData);
      mockBatchPutStocks.mockResolvedValue(undefined);

      const event = createMockEvent({
        ticker: 'AAPL',
        startDate: '2025-01-01',
        endDate: '2025-01-01',
      });

      const response = await handleStocksRequest(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Verify structure
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('_meta');

      // Verify _meta fields
      expect(body._meta).toHaveProperty('cached');
      expect(body._meta).toHaveProperty('cacheHitRate');
      expect(body._meta).toHaveProperty('timestamp');

      expect(typeof body._meta.cached).toBe('boolean');
      expect(typeof body._meta.cacheHitRate).toBe('number');
      expect(typeof body._meta.timestamp).toBe('string');
    });
  });
});
