/**
 * Polygon.io API Service Tests (Lambda Backend)
 * Tests for news article fetching and hash generation
 */

import axios from 'axios';
import {
  fetchNews,
  generateArticleHash,
  transformPolygonToNewsDetails,
} from '@/services/api/polygon.service';
import type { PolygonNewsArticle } from '@/services/api/polygon.types';

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

describe('Polygon Service', () => {
  let mockAxiosInstance: any;

  beforeEach(() => {
    // Reset mocks before each test
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

  describe('fetchNews', () => {
    it('should fetch news articles for valid ticker from Lambda backend', async () => {
      const mockArticles: PolygonNewsArticle[] = [
        {
          id: 'article-1',
          title: 'Apple announces new iPhone',
          author: 'John Doe',
          published_utc: '2025-01-15T10:30:00Z',
          article_url: 'https://example.com/article-1',
          tickers: ['AAPL', 'NASDAQ:AAPL'],
          description: 'Apple Inc. announced a new iPhone model today.',
          image_url: 'https://example.com/image.jpg',
          publisher: {
            name: 'TechNews',
            homepage_url: 'https://technews.com',
            logo_url: 'https://technews.com/logo.png',
            favicon_url: 'https://technews.com/favicon.ico',
          },
          amp_url: 'https://example.com/article-1/amp',
        },
        {
          id: 'article-2',
          title: 'Apple stock surges',
          author: 'Jane Smith',
          published_utc: '2025-01-15T14:00:00Z',
          article_url: 'https://example.com/article-2',
          tickers: ['AAPL'],
          description: 'Apple stock price increased by 5% today.',
          publisher: {
            name: 'FinanceDaily',
            homepage_url: 'https://financedaily.com',
          },
        },
      ];

      mockAxiosInstance.get.mockResolvedValueOnce({ data: mockArticles });

      const articles = await fetchNews('AAPL', '2025-01-01', '2025-01-15');

      expect(articles).toHaveLength(2);
      expect(articles[0].title).toBe('Apple announces new iPhone');
      expect(articles[0].tickers).toContain('AAPL');
      expect(articles[1].title).toBe('Apple stock surges');

      // Verify API was called with correct params
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/news', {
        params: {
          ticker: 'AAPL',
          startDate: '2025-01-01',
          endDate: '2025-01-15',
          limit: 100,
        },
      });
    });

    it('should handle rate limit errors (429)', async () => {
      const error = {
        isAxiosError: true,
        response: {
          status: 429,
          data: { error: 'Rate limit exceeded' },
        },
        message: 'Request failed with status code 429',
      };

      mockAxiosInstance.get.mockRejectedValueOnce(error);

      await expect(fetchNews('AAPL', '2025-01-01')).rejects.toThrow(
        'Rate limit exceeded'
      );
    });

    it('should handle invalid request (400)', async () => {
      const error = {
        isAxiosError: true,
        response: {
          status: 400,
          data: { error: 'Invalid ticker format' },
        },
        message: 'Request failed with status code 400',
      };

      mockAxiosInstance.get.mockRejectedValueOnce(error);

      await expect(fetchNews('AAPL', '2025-01-01')).rejects.toThrow(
        'Invalid ticker format'
      );
    });

    it('should handle backend errors (500)', async () => {
      const error = {
        isAxiosError: true,
        response: {
          status: 500,
          data: { error: 'Polygon API unavailable' },
        },
        message: 'Request failed with status code 500',
      };

      mockAxiosInstance.get.mockRejectedValueOnce(error);

      await expect(fetchNews('AAPL', '2025-01-01')).rejects.toThrow(
        'Polygon API unavailable'
      );
    });

    it('should return empty array for ticker not found (404)', async () => {
      const error = {
        isAxiosError: true,
        response: {
          status: 404,
          data: { error: 'Ticker not found' },
        },
        message: 'Request failed with status code 404',
      };

      mockAxiosInstance.get.mockRejectedValueOnce(error);

      // 404 returns empty array instead of throwing
      const articles = await fetchNews('INVALID', '2025-01-01');
      expect(articles).toEqual([]);
    });

    it('should not include date params when not provided', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: [] });

      await fetchNews('AAPL');

      // Verify only ticker and limit are included
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/news', {
        params: {
          ticker: 'AAPL',
          limit: 100,
        },
      });
    });

    it('should pass custom limit parameter', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: [] });

      await fetchNews('AAPL', undefined, undefined, 50);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/news', {
        params: {
          ticker: 'AAPL',
          limit: 50,
        },
      });
    });
  });

  describe('generateArticleHash', () => {
    it('should generate consistent MD5 hash for same URL', () => {
      const url = 'https://example.com/article-1';

      const hash1 = generateArticleHash(url);
      const hash2 = generateArticleHash(url);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(32); // MD5 hash is 32 hex characters
    });

    it('should generate different hashes for different URLs', () => {
      const url1 = 'https://example.com/article-1';
      const url2 = 'https://example.com/article-2';

      const hash1 = generateArticleHash(url1);
      const hash2 = generateArticleHash(url2);

      expect(hash1).not.toBe(hash2);
    });

    it('should generate hash for empty string', () => {
      const hash = generateArticleHash('');

      expect(hash).toHaveLength(32);
      expect(hash).toBe('d41d8cd98f00b204e9800998ecf8427e'); // MD5 of empty string
    });
  });

  describe('transformPolygonToNewsDetails', () => {
    it('should transform Polygon article to NewsDetails format', () => {
      const polygonArticle: PolygonNewsArticle = {
        id: 'article-1',
        title: 'Apple announces new product',
        author: 'John Doe',
        published_utc: '2025-01-15T10:30:00Z',
        article_url: 'https://example.com/article',
        tickers: ['AAPL', 'NASDAQ:AAPL'],
        description: 'Apple Inc. announced a new product today.',
        image_url: 'https://example.com/image.jpg',
        publisher: {
          name: 'TechNews',
          homepage_url: 'https://technews.com',
          logo_url: 'https://technews.com/logo.png',
          favicon_url: 'https://technews.com/favicon.ico',
        },
        amp_url: 'https://example.com/article/amp',
      };

      const newsDetails = transformPolygonToNewsDetails(polygonArticle, 'AAPL');

      expect(newsDetails.ticker).toBe('AAPL');
      expect(newsDetails.title).toBe('Apple announces new product');
      expect(newsDetails.articleUrl).toBe('https://example.com/article');
      expect(newsDetails.publisher).toBe('TechNews');
      expect(newsDetails.articleDescription).toBe('Apple Inc. announced a new product today.');
      expect(newsDetails.ampUrl).toBe('https://example.com/article/amp');
      expect(newsDetails.articleTickers).toBe('AAPL,NASDAQ:AAPL');
      expect(newsDetails.date).toBe('2025-01-15'); // YYYY-MM-DD format
      expect(newsDetails.articleDate).toBe('2025-01-15');
    });

    it('should handle missing optional fields', () => {
      const polygonArticle: PolygonNewsArticle = {
        id: 'article-2',
        title: 'News article',
        author: 'Jane Smith',
        published_utc: '2025-01-15T14:00:00Z',
        article_url: 'https://example.com/article-2',
        tickers: ['AAPL'],
        publisher: {
          name: 'NewsOrg',
        },
      };

      const newsDetails = transformPolygonToNewsDetails(polygonArticle, 'AAPL');

      expect(newsDetails.articleDescription).toBe('');
      expect(newsDetails.ampUrl).toBe('');
    });

    it('should extract date correctly from ISO timestamp', () => {
      const polygonArticle: PolygonNewsArticle = {
        id: 'article-3',
        title: 'Test article',
        author: 'Test Author',
        published_utc: '2025-12-31T23:59:59Z',
        article_url: 'https://example.com/test',
        tickers: ['AAPL'],
        publisher: { name: 'Test Publisher' },
      };

      const newsDetails = transformPolygonToNewsDetails(polygonArticle, 'AAPL');

      expect(newsDetails.date).toBe('2025-12-31');
      expect(newsDetails.articleDate).toBe('2025-12-31');
    });

    it('should join multiple tickers with comma', () => {
      const polygonArticle: PolygonNewsArticle = {
        id: 'article-4',
        title: 'Tech giants news',
        author: 'Reporter',
        published_utc: '2025-01-15T10:00:00Z',
        article_url: 'https://example.com/tech',
        tickers: ['AAPL', 'GOOGL', 'MSFT'],
        publisher: { name: 'TechDaily' },
      };

      const newsDetails = transformPolygonToNewsDetails(polygonArticle, 'AAPL');

      expect(newsDetails.articleTickers).toBe('AAPL,GOOGL,MSFT');
    });
  });
});
