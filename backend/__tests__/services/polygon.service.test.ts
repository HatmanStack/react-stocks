/**
 * Tests for Polygon API service
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import axios from 'axios';
import { fetchNews } from '../../src/services/polygon.service';
import type { PolygonNewsArticle, PolygonNewsResponse } from '../../src/types/polygon.types';

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

describe('Polygon Service', () => {
  const mockApiKey = 'test-api-key';
  let consoleLogSpy: typeof console.log;
  let consoleErrorSpy: typeof console.error;
  let consoleWarnSpy: typeof console.warn;
  let axiosInstance: ReturnType<typeof createAxiosInstanceMock>;

  beforeEach(() => {
    // Mock console methods
    consoleLogSpy = console.log;
    consoleErrorSpy = console.error;
    consoleWarnSpy = console.warn;
    console.log = () => {};
    console.error = () => {};
    console.warn = () => {};

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
    console.warn = consoleWarnSpy;
    // Always restore real timers (in case test used fake timers and threw)
    jest.useRealTimers();
  });

  describe('fetchNews', () => {
    const mockArticles: PolygonNewsArticle[] = [
      {
        id: '1',
        publisher: { name: 'Test Publisher' },
        title: 'Test Article',
        author: 'Test Author',
        published_utc: '2024-01-15T10:00:00Z',
        article_url: 'https://example.com/article',
        tickers: ['AAPL'],
        description: 'Test description',
      },
    ];

    const mockResponse: PolygonNewsResponse = {
      results: mockArticles,
      status: 'OK',
      request_id: 'test-request',
      count: 1,
    };

    it('should fetch news successfully', async () => {
      axiosInstance.get.mockResolvedValue({ data: mockResponse });

      const result = await fetchNews('AAPL', '2024-01-01', '2024-01-31', 100, mockApiKey);

      expect(result).toEqual(mockArticles);
      expect(axiosInstance.get).toHaveBeenCalledWith(
        expect.stringContaining('/v2/reference/news')
      );
    });

    it('should fetch news without date filters', async () => {
      axiosInstance.get.mockResolvedValue({ data: mockResponse });

      const result = await fetchNews('AAPL', undefined, undefined, 100, mockApiKey);

      expect(result).toEqual(mockArticles);
      expect(axiosInstance.get).toHaveBeenCalled();
    });

    it('should handle pagination', async () => {
      const page1Response: PolygonNewsResponse = {
        results: [mockArticles[0]],
        status: 'OK',
        request_id: 'test-1',
        count: 1,
        next_url: `${POLYGON_BASE_URL}/v2/reference/news?cursor=next`,
      };

      const page2Response: PolygonNewsResponse = {
        results: [{ ...mockArticles[0], id: '2', title: 'Article 2' }],
        status: 'OK',
        request_id: 'test-2',
        count: 1,
      };

      axiosInstance.get
        .mockResolvedValueOnce({ data: page1Response })
        .mockResolvedValueOnce({ data: page2Response });

      // Use fake timers for pagination delay
      jest.useFakeTimers();

      const promise = fetchNews('AAPL', undefined, undefined, 100, mockApiKey);

      // Fast-forward through pagination delay
      await jest.advanceTimersByTimeAsync(1000);

      const result = await promise;

      expect(result).toHaveLength(2);
      expect(axiosInstance.get).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it('should return empty array for 404', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 404 },
      };
      axiosInstance.get.mockRejectedValue(axiosError);

      const result = await fetchNews('INVALID', undefined, undefined, 100, mockApiKey);

      expect(result).toEqual([]);
    });

    it('should limit to maximum pages', async () => {
      const mockPageResponse: PolygonNewsResponse = {
        results: [mockArticles[0]],
        status: 'OK',
        request_id: 'test',
        count: 1,
        next_url: `${POLYGON_BASE_URL}/v2/reference/news?cursor=next`,
      };

      // Always return a page with next_url to simulate infinite pagination
      axiosInstance.get.mockResolvedValue({ data: mockPageResponse });

      jest.useFakeTimers();

      const promise = fetchNews('AAPL', undefined, undefined, 100, mockApiKey);

      // Advance through delays for all 10 pages
      for (let i = 0; i < 10; i++) {
        await jest.advanceTimersByTimeAsync(1000);
      }

      const result = await promise;

      // Should stop at 10 pages
      expect(axiosInstance.get).toHaveBeenCalledTimes(10);
      expect(result).toHaveLength(10); // 1 article per page * 10 pages

      jest.useRealTimers();
    });
  });
});

const POLYGON_BASE_URL = 'https://api.polygon.io';
