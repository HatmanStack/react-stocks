/**
 * Tests for news handler
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handleNewsRequest } from '../../src/handlers/news.handler';

// Mock the Polygon service
jest.mock('../../src/services/polygon.service');

import * as polygonService from '../../src/services/polygon.service';
const mockFetchNews = polygonService.fetchNews as jest.MockedFunction<typeof polygonService.fetchNews>;

describe('News Handler', () => {
  let consoleLogSpy: typeof console.log;
  let consoleErrorSpy: typeof console.error;

  // Helper to create mock event
  function createMockEvent(queryParams?: Record<string, string>): APIGatewayProxyEventV2 {
    return {
      rawPath: '/news',
      requestContext: {
        requestId: 'test-request-id',
        http: {
          method: 'GET',
          path: '/news',
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
      routeKey: 'GET /news',
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
    process.env.POLYGON_API_KEY = 'test-api-key';

    // Clear mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    console.log = consoleLogSpy;
    console.error = consoleErrorSpy;
    delete process.env.POLYGON_API_KEY;
  });

  describe('Valid Requests', () => {
    it('should fetch news successfully with all parameters', async () => {
      const mockArticles = [
        {
          id: '1',
          publisher: { name: 'Test Publisher' },
          title: 'Test Article',
          author: 'Test Author',
          published_utc: '2024-01-15T10:00:00Z',
          article_url: 'https://example.com/article',
          tickers: ['AAPL'],
        },
      ];
      mockFetchNews.mockResolvedValue(mockArticles);

      const event = createMockEvent({
        ticker: 'AAPL',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        limit: '50',
      });

      const response = await handleNewsRequest(event);

      expect(response.statusCode).toBe(200);
      expect(mockFetchNews).toHaveBeenCalledWith(
        'AAPL',
        '2024-01-01',
        '2024-01-31',
        50,
        'test-api-key'
      );
      const body = JSON.parse(response.body);
      expect(body.data).toEqual(mockArticles);
    });

    it('should fetch news with only ticker (defaults)', async () => {
      mockFetchNews.mockResolvedValue([]);

      const event = createMockEvent({
        ticker: 'GOOGL',
      });

      const response = await handleNewsRequest(event);

      expect(response.statusCode).toBe(200);
      expect(mockFetchNews).toHaveBeenCalledWith(
        'GOOGL',
        undefined,
        undefined,
        100, // default limit
        'test-api-key'
      );
    });

    it('should normalize ticker to uppercase', async () => {
      mockFetchNews.mockResolvedValue([]);

      const event = createMockEvent({
        ticker: 'aapl',
      });

      await handleNewsRequest(event);

      expect(mockFetchNews).toHaveBeenCalledWith(
        'AAPL',
        undefined,
        undefined,
        100,
        'test-api-key'
      );
    });

    it('should handle empty results', async () => {
      mockFetchNews.mockResolvedValue([]);

      const event = createMockEvent({
        ticker: 'AAPL',
      });

      const response = await handleNewsRequest(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toEqual([]);
    });
  });

  describe('Parameter Validation', () => {
    it('should return 400 for missing ticker', async () => {
      const event = createMockEvent({});

      const response = await handleNewsRequest(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('ticker');
    });

    it('should return 400 for invalid ticker format', async () => {
      const event = createMockEvent({
        ticker: 'AAPL@#$',
      });

      const response = await handleNewsRequest(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('ticker format');
    });

    it('should return 400 for invalid startDate format', async () => {
      const event = createMockEvent({
        ticker: 'AAPL',
        startDate: '2024/01/01',
      });

      const response = await handleNewsRequest(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('startDate format');
    });

    it('should return 400 for invalid endDate format', async () => {
      const event = createMockEvent({
        ticker: 'AAPL',
        endDate: 'invalid-date',
      });

      const response = await handleNewsRequest(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('endDate format');
    });

    it('should return 400 for invalid limit (non-numeric)', async () => {
      const event = createMockEvent({
        ticker: 'AAPL',
        limit: 'abc',
      });

      const response = await handleNewsRequest(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('limit');
    });

    it('should return 400 for invalid limit (negative)', async () => {
      const event = createMockEvent({
        ticker: 'AAPL',
        limit: '-10',
      });

      const response = await handleNewsRequest(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('limit');
    });

    it('should cap limit at 1000', async () => {
      mockFetchNews.mockResolvedValue([]);

      const event = createMockEvent({
        ticker: 'AAPL',
        limit: '2000',
      });

      await handleNewsRequest(event);

      expect(mockFetchNews).toHaveBeenCalledWith(
        'AAPL',
        undefined,
        undefined,
        1000, // capped at 1000
        'test-api-key'
      );
    });
  });

  describe('Environment Configuration', () => {
    it('should return 500 when API key is missing', async () => {
      delete process.env.POLYGON_API_KEY;

      const event = createMockEvent({
        ticker: 'AAPL',
      });

      const response = await handleNewsRequest(event);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('configuration error');
    });
  });

  describe('Service Error Propagation', () => {
    it('should propagate service errors with correct status codes', async () => {
      const serviceError = new Error('Rate limit exceeded');
      (serviceError as any).statusCode = 429;
      mockFetchNews.mockRejectedValue(serviceError);

      const event = createMockEvent({
        ticker: 'AAPL',
      });

      const response = await handleNewsRequest(event);

      expect(response.statusCode).toBe(429);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Rate limit exceeded');
    });

    it('should return 500 for service errors without status code', async () => {
      mockFetchNews.mockRejectedValue(new Error('Unexpected error'));

      const event = createMockEvent({
        ticker: 'AAPL',
      });

      const response = await handleNewsRequest(event);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Unexpected error');
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers in successful responses', async () => {
      mockFetchNews.mockResolvedValue([]);

      const event = createMockEvent({
        ticker: 'AAPL',
      });

      const response = await handleNewsRequest(event);

      expect(response.headers).toHaveProperty('Access-Control-Allow-Origin');
    });

    it('should include CORS headers in error responses', async () => {
      const event = createMockEvent({});

      const response = await handleNewsRequest(event);

      expect(response.headers).toHaveProperty('Access-Control-Allow-Origin');
    });
  });
});
