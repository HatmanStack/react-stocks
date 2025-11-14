/**
 * Integration tests for news handler with DynamoDB caching and deduplication
 * Tests the three-tier lookup pattern with article hashing
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handleNewsRequest } from '../../src/handlers/news.handler';
import type { FinnhubNewsArticle } from '../../src/types/finnhub.types';

// Mock the repositories and services
import * as newsCacheRepo from '../../src/repositories/newsCache.repository';
import * as finnhubService from '../../src/services/finnhub.service';
import * as hashUtil from '../../src/utils/hash.util';

// Create mock functions with proper types
const mockQueryArticlesByTicker = jest.fn<typeof newsCacheRepo.queryArticlesByTicker>();
const mockBatchPutArticles = jest.fn<typeof newsCacheRepo.batchPutArticles>();
const mockExistsInCache = jest.fn<typeof newsCacheRepo.existsInCache>();
const mockFetchCompanyNews = jest.fn<typeof finnhubService.fetchCompanyNews>();
const mockGenerateArticleHash = jest.fn<typeof hashUtil.generateArticleHash>();

// Mock the modules
jest.mock('../../src/repositories/newsCache.repository', () => ({
  queryArticlesByTicker: mockQueryArticlesByTicker,
  batchPutArticles: mockBatchPutArticles,
  existsInCache: mockExistsInCache,
}));

jest.mock('../../src/services/finnhub.service', () => ({
  fetchCompanyNews: mockFetchCompanyNews,
}));

jest.mock('../../src/utils/hash.util', () => ({
  generateArticleHash: mockGenerateArticleHash,
}));

describe('News Handler Integration Tests', () => {
  let consoleLogSpy: typeof console.log;
  let consoleErrorSpy: typeof console.error;
  let consoleWarnSpy: typeof console.warn;

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

  // Helper to create mock Finnhub articles
  function createMockFinnhubArticles(count: number, startDate = '2025-01-01'): FinnhubNewsArticle[] {
    return Array.from({ length: count }, (_, i) => ({
      category: 'company news',
      datetime: new Date(`${startDate}T${12 + i}:00:00Z`).getTime() / 1000,
      headline: `Article ${i + 1}`,
      id: i + 1,
      image: `https://example.com/image${i + 1}.jpg`,
      related: 'AAPL',
      source: 'Reuters',
      summary: `Summary for article ${i + 1}`,
      url: `https://example.com/article${i + 1}`,
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
    process.env.FINNHUB_API_KEY = 'test-api-key';

    // Clear all mocks
    jest.clearAllMocks();

    // Setup default hash generation behavior
    mockGenerateArticleHash.mockImplementation((url: string) => {
      // Simple deterministic hash for testing
      return url.slice(-16).padStart(16, '0');
    });
  });

  afterEach(() => {
    console.log = consoleLogSpy;
    console.error = consoleErrorSpy;
    console.warn = consoleWarnSpy;
    delete process.env.FINNHUB_API_KEY;
  });

  describe('Cache Miss Flow', () => {
    it('should fetch from API when cache has fewer than 10 articles', async () => {
      // Setup: Cache has only 5 articles (below threshold)
      const cachedItems = [
        {
          ticker: 'AAPL',
          articleHash: 'hash1',
          article: {
            title: 'Cached Article 1',
            url: 'https://example.com/cached1',
            description: 'Description 1',
            date: '2025-01-01',
            publisher: 'Reuters',
          },
          ttl: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
          fetchedAt: Date.now(),
        },
      ];

      mockQueryArticlesByTicker.mockResolvedValue(cachedItems);

      // Setup: API returns new articles
      const apiArticles = createMockFinnhubArticles(20, '2025-01-01');
      mockFetchCompanyNews.mockResolvedValue(apiArticles);

      // Setup: All articles are new (not in cache)
      mockExistsInCache.mockResolvedValue(false);
      mockBatchPutArticles.mockResolvedValue(undefined);

      const event = createMockEvent({
        ticker: 'AAPL',
        from: '2025-01-01',
        to: '2025-01-30',
      });

      const response = await handleNewsRequest(event);

      // Verify response
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(20);
      expect(body._meta.cached).toBe(false);
      expect(body._meta.newArticles).toBe(20);
      expect(body._meta.cachedArticles).toBe(1);

      // Verify cache was checked
      expect(mockQueryArticlesByTicker).toHaveBeenCalledWith('AAPL');

      // Verify API was called
      expect(mockFetchCompanyNews).toHaveBeenCalledWith(
        'AAPL',
        '2025-01-01',
        '2025-01-30',
        'test-api-key'
      );

      // Verify new articles were cached
      expect(mockBatchPutArticles).toHaveBeenCalled();
    });

    it('should cache empty cache scenario', async () => {
      mockQueryArticlesByTicker.mockResolvedValue([]);

      const apiArticles = createMockFinnhubArticles(15);
      mockFetchCompanyNews.mockResolvedValue(apiArticles);

      mockExistsInCache.mockResolvedValue(false);
      mockBatchPutArticles.mockResolvedValue(undefined);

      const event = createMockEvent({
        ticker: 'MSFT',
        from: '2025-01-01',
        to: '2025-01-15',
      });

      const response = await handleNewsRequest(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body._meta.cached).toBe(false);
      expect(body._meta.newArticles).toBe(15);
      expect(body._meta.cachedArticles).toBe(0);
    });
  });

  describe('Cache Hit Flow', () => {
    it('should return cached data when cache has >= 10 articles in date range', async () => {
      // Setup: Cache has 15 articles (above threshold)
      const cachedItems = Array.from({ length: 15 }, (_, i) => ({
        ticker: 'AAPL',
        articleHash: `hash${i + 1}`,
        article: {
          title: `Cached Article ${i + 1}`,
          url: `https://example.com/cached${i + 1}`,
          description: `Description ${i + 1}`,
          date: '2025-01-15',
          publisher: 'Reuters',
        },
        ttl: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        fetchedAt: Date.now(),
      }));

      mockQueryArticlesByTicker.mockResolvedValue(cachedItems);

      const event = createMockEvent({
        ticker: 'AAPL',
        from: '2025-01-01',
        to: '2025-01-30',
      });

      const response = await handleNewsRequest(event);

      // Verify response
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(15);
      expect(body._meta.cached).toBe(true);
      expect(body._meta.newArticles).toBe(0);
      expect(body._meta.cachedArticles).toBe(15);

      // Verify cache was checked
      expect(mockQueryArticlesByTicker).toHaveBeenCalledWith('AAPL');

      // Verify API was NOT called
      expect(mockFetchCompanyNews).not.toHaveBeenCalled();

      // Verify no new articles were cached
      expect(mockBatchPutArticles).not.toHaveBeenCalled();
    });

    it('should transform cached data to correct Finnhub format', async () => {
      const cachedItems = Array.from({ length: 12 }, (_, i) => ({
        ticker: 'GOOGL',
        articleHash: `hash${i}`,
        article: {
          title: `Article ${i}`,
          url: `https://example.com/article${i}`,
          description: `Summary ${i}`,
          date: '2025-01-10',
          publisher: 'TechCrunch',
          imageUrl: `https://example.com/img${i}.jpg`,
        },
        ttl: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        fetchedAt: Date.now(),
      }));

      mockQueryArticlesByTicker.mockResolvedValue(cachedItems);

      const event = createMockEvent({
        ticker: 'GOOGL',
        from: '2025-01-01',
        to: '2025-01-15',
      });

      const response = await handleNewsRequest(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data[0]).toHaveProperty('datetime');
      expect(body.data[0]).toHaveProperty('headline');
      expect(body.data[0]).toHaveProperty('source');
      expect(body.data[0]).toHaveProperty('summary');
      expect(body.data[0]).toHaveProperty('url');
      expect(body._meta.cached).toBe(true);
    });

    it('should filter articles by date range', async () => {
      const cachedItems = [
        ...Array.from({ length: 5 }, (_, i) => ({
          ticker: 'AAPL',
          articleHash: `hash_old_${i}`,
          article: {
            title: `Old Article ${i}`,
            url: `https://example.com/old${i}`,
            description: 'Old',
            date: '2024-12-15', // Outside date range
            publisher: 'Reuters',
          },
          ttl: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
          fetchedAt: Date.now(),
        })),
        ...Array.from({ length: 10 }, (_, i) => ({
          ticker: 'AAPL',
          articleHash: `hash_new_${i}`,
          article: {
            title: `New Article ${i}`,
            url: `https://example.com/new${i}`,
            description: 'New',
            date: '2025-01-15', // Within date range
            publisher: 'Reuters',
          },
          ttl: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
          fetchedAt: Date.now(),
        })),
      ];

      mockQueryArticlesByTicker.mockResolvedValue(cachedItems);

      const event = createMockEvent({
        ticker: 'AAPL',
        from: '2025-01-01',
        to: '2025-01-30',
      });

      const response = await handleNewsRequest(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(10); // Only articles in date range
      expect(body._meta.cached).toBe(true);
    });
  });

  describe('Duplicate Article Prevention', () => {
    it('should filter out duplicate articles when caching', async () => {
      mockQueryArticlesByTicker.mockResolvedValue([]);

      const apiArticles = createMockFinnhubArticles(20);
      mockFetchCompanyNews.mockResolvedValue(apiArticles);

      // Setup: First 10 articles already exist in cache, last 10 are new
      mockExistsInCache.mockImplementation(async (ticker: string, hash: string) => {
        return hash.includes('article1') && !hash.includes('article10'); // First 10 exist
      });

      mockBatchPutArticles.mockResolvedValue(undefined);

      const event = createMockEvent({
        ticker: 'AAPL',
        from: '2025-01-01',
        to: '2025-01-30',
      });

      const response = await handleNewsRequest(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Verify existsInCache was called for each article
      expect(mockExistsInCache).toHaveBeenCalledTimes(20);

      // Verify only new articles were cached
      expect(mockBatchPutArticles).toHaveBeenCalled();
      const cachedArticles = mockBatchPutArticles.mock.calls[0][0];
      expect(cachedArticles.length).toBeLessThan(20); // Some were filtered as duplicates
    });

    it('should generate consistent hashes for articles', async () => {
      mockQueryArticlesByTicker.mockResolvedValue([]);

      const apiArticles = createMockFinnhubArticles(5);
      mockFetchCompanyNews.mockResolvedValue(apiArticles);

      mockExistsInCache.mockResolvedValue(false);
      mockBatchPutArticles.mockResolvedValue(undefined);

      const event = createMockEvent({
        ticker: 'AAPL',
        from: '2025-01-01',
        to: '2025-01-30',
      });

      await handleNewsRequest(event);

      // Verify hash function was called for each article
      expect(mockGenerateArticleHash).toHaveBeenCalledTimes(5);

      // Verify each article URL was hashed
      apiArticles.forEach((article) => {
        expect(mockGenerateArticleHash).toHaveBeenCalledWith(article.url);
      });
    });
  });

  describe('Error Handling', () => {
    it('should fall back to API if cache check fails', async () => {
      // Setup: Cache throws error
      mockQueryArticlesByTicker.mockRejectedValue(new Error('DynamoDB unavailable'));

      // Setup: API succeeds
      const apiArticles = createMockFinnhubArticles(10);
      mockFetchCompanyNews.mockResolvedValue(apiArticles);

      const event = createMockEvent({
        ticker: 'AAPL',
        from: '2025-01-01',
        to: '2025-01-30',
      });

      const response = await handleNewsRequest(event);

      // Verify request succeeded despite cache failure
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(10);
      expect(body._meta.cached).toBe(false);

      // Verify API was called as fallback
      expect(mockFetchCompanyNews).toHaveBeenCalled();
    });

    it('should log cache write errors but not fail the request', async () => {
      mockQueryArticlesByTicker.mockResolvedValue([]);

      const apiArticles = createMockFinnhubArticles(10);
      mockFetchCompanyNews.mockResolvedValue(apiArticles);

      mockExistsInCache.mockResolvedValue(false);

      // Setup: Cache write fails
      mockBatchPutArticles.mockRejectedValue(new Error('DynamoDB write failed'));

      const event = createMockEvent({
        ticker: 'AAPL',
        from: '2025-01-01',
        to: '2025-01-30',
      });

      const response = await handleNewsRequest(event);

      // Verify request still succeeded
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(10);

      // Verify error was logged
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('[NewsHandler] Failed to cache news articles'),
        expect.any(Error)
      );
    });
  });

  describe('Response Format', () => {
    it('should include all required cache metadata fields', async () => {
      mockQueryArticlesByTicker.mockResolvedValue([]);

      const apiArticles = createMockFinnhubArticles(10);
      mockFetchCompanyNews.mockResolvedValue(apiArticles);

      mockExistsInCache.mockResolvedValue(false);
      mockBatchPutArticles.mockResolvedValue(undefined);

      const event = createMockEvent({
        ticker: 'AAPL',
        from: '2025-01-01',
        to: '2025-01-30',
      });

      const response = await handleNewsRequest(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Verify structure
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('_meta');

      // Verify _meta fields
      expect(body._meta).toHaveProperty('cached');
      expect(body._meta).toHaveProperty('newArticles');
      expect(body._meta).toHaveProperty('cachedArticles');
      expect(body._meta).toHaveProperty('timestamp');

      expect(typeof body._meta.cached).toBe('boolean');
      expect(typeof body._meta.newArticles).toBe('number');
      expect(typeof body._meta.cachedArticles).toBe('number');
      expect(typeof body._meta.timestamp).toBe('string');
    });

    it('should sort articles by date descending', async () => {
      const cachedItems = [
        {
          ticker: 'AAPL',
          articleHash: 'hash1',
          article: {
            title: 'Older Article',
            url: 'https://example.com/old',
            description: 'Old',
            date: '2025-01-05',
            publisher: 'Reuters',
          },
          ttl: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
          fetchedAt: Date.now(),
        },
        {
          ticker: 'AAPL',
          articleHash: 'hash2',
          article: {
            title: 'Newer Article',
            url: 'https://example.com/new',
            description: 'New',
            date: '2025-01-15',
            publisher: 'Reuters',
          },
          ttl: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
          fetchedAt: Date.now(),
        },
        ...Array.from({ length: 10 }, (_, i) => ({
          ticker: 'AAPL',
          articleHash: `hash${i + 3}`,
          article: {
            title: `Article ${i}`,
            url: `https://example.com/${i}`,
            description: 'Desc',
            date: '2025-01-10',
            publisher: 'Reuters',
          },
          ttl: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
          fetchedAt: Date.now(),
        })),
      ];

      mockQueryArticlesByTicker.mockResolvedValue(cachedItems);

      const event = createMockEvent({
        ticker: 'AAPL',
        from: '2025-01-01',
        to: '2025-01-30',
      });

      const response = await handleNewsRequest(event);

      const body = JSON.parse(response.body);
      expect(body.data[0].headline).toBe('Newer Article'); // Most recent first
    });
  });
});
