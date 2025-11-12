/**
 * Tests for stocks handler
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handleStocksRequest } from '../../src/handlers/stocks.handler';

// Mock the Tiingo service
jest.mock('../../src/services/tiingo.service');

import * as tiingoService from '../../src/services/tiingo.service';
const mockFetchStockPrices = tiingoService.fetchStockPrices as jest.MockedFunction<typeof tiingoService.fetchStockPrices>;
const mockFetchSymbolMetadata = tiingoService.fetchSymbolMetadata as jest.MockedFunction<typeof tiingoService.fetchSymbolMetadata>;

describe('Stocks Handler', () => {
  let consoleLogSpy: typeof console.log;
  let consoleErrorSpy: typeof console.error;

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

  beforeEach(() => {
    // Mock console methods
    consoleLogSpy = console.log;
    consoleErrorSpy = console.error;
    console.log = () => {};
    console.error = () => {};

    // Setup environment
    process.env.TIINGO_API_KEY = 'test-api-key';

    // Clear mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    console.log = consoleLogSpy;
    console.error = consoleErrorSpy;
    delete process.env.TIINGO_API_KEY;
  });

  describe('Valid Requests', () => {
    it('should fetch stock prices successfully', async () => {
      const mockPrices = [
        { date: '2024-01-01T00:00:00.000Z', close: 100, open: 99, high: 101, low: 98, volume: 1000 },
      ];
      mockFetchStockPrices.mockResolvedValue(mockPrices);

      const event = createMockEvent({
        ticker: 'AAPL',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      const response = await handleStocksRequest(event);

      expect(response.statusCode).toBe(200);
      expect(mockFetchStockPrices).toHaveBeenCalledWith(
        'AAPL',
        '2024-01-01',
        '2024-01-31',
        'test-api-key'
      );
      const body = JSON.parse(response.body);
      expect(body.data).toEqual(mockPrices);
    });

    it('should fetch stock prices without end date', async () => {
      const mockPrices = [{ date: '2024-01-01T00:00:00.000Z', close: 100 }];
      mockFetchStockPrices.mockResolvedValue(mockPrices);

      const event = createMockEvent({
        ticker: 'GOOGL',
        startDate: '2024-01-01',
      });

      const response = await handleStocksRequest(event);

      expect(response.statusCode).toBe(200);
      expect(mockFetchStockPrices).toHaveBeenCalledWith(
        'GOOGL',
        '2024-01-01',
        undefined,
        'test-api-key'
      );
    });

    it('should fetch symbol metadata successfully', async () => {
      const mockMetadata = {
        ticker: 'AAPL',
        name: 'Apple Inc.',
        exchangeCode: 'NASDAQ',
        startDate: '1980-12-12',
        endDate: '2024-12-31',
        description: 'Apple Inc.',
      };
      mockFetchSymbolMetadata.mockResolvedValue(mockMetadata);

      const event = createMockEvent({
        ticker: 'AAPL',
        type: 'metadata',
      });

      const response = await handleStocksRequest(event);

      expect(response.statusCode).toBe(200);
      expect(mockFetchSymbolMetadata).toHaveBeenCalledWith('AAPL', 'test-api-key');
      const body = JSON.parse(response.body);
      expect(body.data).toEqual(mockMetadata);
    });

    it('should normalize ticker to uppercase', async () => {
      mockFetchStockPrices.mockResolvedValue([]);

      const event = createMockEvent({
        ticker: 'aapl',
        startDate: '2024-01-01',
      });

      await handleStocksRequest(event);

      expect(mockFetchStockPrices).toHaveBeenCalledWith(
        'AAPL',
        '2024-01-01',
        undefined,
        'test-api-key'
      );
    });
  });

  describe('Parameter Validation', () => {
    it('should return 400 for missing ticker', async () => {
      const event = createMockEvent({
        startDate: '2024-01-01',
      });

      const response = await handleStocksRequest(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('ticker');
    });

    it('should return 400 for missing startDate when type is prices', async () => {
      const event = createMockEvent({
        ticker: 'AAPL',
      });

      const response = await handleStocksRequest(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('startDate');
    });

    it('should return 400 for invalid ticker format', async () => {
      const event = createMockEvent({
        ticker: 'AAPL@#',
        startDate: '2024-01-01',
      });

      const response = await handleStocksRequest(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('ticker format');
    });

    it('should return 400 for invalid startDate format', async () => {
      const event = createMockEvent({
        ticker: 'AAPL',
        startDate: '2024/01/01',
      });

      const response = await handleStocksRequest(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('startDate format');
    });

    it('should return 400 for invalid endDate format', async () => {
      const event = createMockEvent({
        ticker: 'AAPL',
        startDate: '2024-01-01',
        endDate: 'invalid-date',
      });

      const response = await handleStocksRequest(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('endDate format');
    });

    it('should return 400 for invalid type', async () => {
      const event = createMockEvent({
        ticker: 'AAPL',
        type: 'invalid',
      });

      const response = await handleStocksRequest(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('type');
    });
  });

  describe('Environment Configuration', () => {
    it('should return 500 when API key is missing', async () => {
      delete process.env.TIINGO_API_KEY;

      const event = createMockEvent({
        ticker: 'AAPL',
        startDate: '2024-01-01',
      });

      const response = await handleStocksRequest(event);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('configuration error');
    });
  });

  describe('Service Error Propagation', () => {
    it('should propagate service errors with correct status codes', async () => {
      const serviceError = new Error('Ticker not found');
      (serviceError as any).statusCode = 404;
      mockFetchStockPrices.mockRejectedValue(serviceError);

      const event = createMockEvent({
        ticker: 'INVALID',
        startDate: '2024-01-01',
      });

      const response = await handleStocksRequest(event);

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Ticker not found');
    });

    it('should return 500 for service errors without status code', async () => {
      mockFetchStockPrices.mockRejectedValue(
        new Error('Unexpected error')
      );

      const event = createMockEvent({
        ticker: 'AAPL',
        startDate: '2024-01-01',
      });

      const response = await handleStocksRequest(event);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Unexpected error');
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers in successful responses', async () => {
      mockFetchStockPrices.mockResolvedValue([]);

      const event = createMockEvent({
        ticker: 'AAPL',
        startDate: '2024-01-01',
      });

      const response = await handleStocksRequest(event);

      expect(response.headers).toHaveProperty('Access-Control-Allow-Origin');
    });

    it('should include CORS headers in error responses', async () => {
      const event = createMockEvent({});

      const response = await handleStocksRequest(event);

      expect(response.headers).toHaveProperty('Access-Control-Allow-Origin');
    });
  });
});
