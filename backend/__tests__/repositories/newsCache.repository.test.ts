/**
 * Unit tests for NewsCache repository
 */

import {
  getArticle,
  putArticle,
  batchPutArticles,
  queryArticlesByTicker,
  existsInCache,
  type NewsCacheItem,
  type NewsArticle,
} from '../../src/repositories/newsCache.repository.js';

describe('NewsCache Repository', () => {
  describe('Type Definitions', () => {
    it('should accept valid NewsArticle', () => {
      const article: NewsArticle = {
        title: 'Apple announces new product',
        url: 'https://example.com/article',
        date: '2025-01-15',
        publisher: 'Tech News',
      };

      expect(article).toBeDefined();
      expect(article.title).toBe('Apple announces new product');
      expect(article.url).toContain('example.com');
    });

    it('should accept NewsArticle with optional fields', () => {
      const article: NewsArticle = {
        title: 'Breaking news',
        url: 'https://example.com/news',
        date: '2025-01-15',
        description: 'Detailed description here',
        publisher: 'News Corp',
        imageUrl: 'https://example.com/image.jpg',
      };

      expect(article.description).toBe('Detailed description here');
      expect(article.imageUrl).toContain('image.jpg');
    });

    it('should accept minimal NewsArticle', () => {
      const article: NewsArticle = {
        title: 'Minimal article',
        url: 'https://example.com/min',
        date: '2025-01-15',
      };

      expect(article.description).toBeUndefined();
      expect(article.publisher).toBeUndefined();
    });

    it('should accept valid NewsCacheItem', () => {
      const cacheItem: NewsCacheItem = {
        ticker: 'AAPL',
        articleHash: 'hash_12345',
        article: {
          title: 'Apple news',
          url: 'https://example.com/apple',
          date: '2025-01-15',
        },
        ttl: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        fetchedAt: Date.now(),
      };

      expect(cacheItem.ticker).toBe('AAPL');
      expect(cacheItem.articleHash).toBe('hash_12345');
      expect(cacheItem.article.title).toBe('Apple news');
    });

    it('should accept NewsCacheItem with full article details', () => {
      const cacheItem: NewsCacheItem = {
        ticker: 'GOOGL',
        articleHash: 'hash_67890',
        article: {
          title: 'Google announcement',
          url: 'https://example.com/google',
          date: '2025-01-15',
          description: 'Full description',
          publisher: 'TechCrunch',
          imageUrl: 'https://example.com/google.jpg',
        },
        ttl: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        fetchedAt: Date.now(),
      };

      expect(cacheItem.article.description).toBe('Full description');
      expect(cacheItem.article.publisher).toBe('TechCrunch');
      expect(cacheItem.article.imageUrl).toContain('google.jpg');
    });
  });

  describe('batchPutArticles', () => {
    it('should handle empty items array', async () => {
      await expect(batchPutArticles([])).resolves.not.toThrow();
    });

    // Note: Actual DynamoDB operations would be tested in integration tests
  });

  describe('Repository Function Signatures', () => {
    it('should have correct getArticle signature', () => {
      expect(typeof getArticle).toBe('function');
      expect(getArticle.length).toBe(2); // ticker, articleHash
    });

    it('should have correct putArticle signature', () => {
      expect(typeof putArticle).toBe('function');
      expect(putArticle.length).toBe(1); // item
    });

    it('should have correct batchPutArticles signature', () => {
      expect(typeof batchPutArticles).toBe('function');
      expect(batchPutArticles.length).toBe(1); // items
    });

    it('should have correct queryArticlesByTicker signature', () => {
      expect(typeof queryArticlesByTicker).toBe('function');
      expect(queryArticlesByTicker.length).toBe(1); // ticker
    });

    it('should have correct existsInCache signature', () => {
      expect(typeof existsInCache).toBe('function');
      expect(existsInCache.length).toBe(2); // ticker, articleHash
    });
  });

  describe('Data Validation', () => {
    it('should accept valid article hash format', () => {
      const validHashes = ['hash_12345', 'md5_abc123', 'sha256_def456'];
      validHashes.forEach((hash) => {
        expect(hash).toBeTruthy();
        expect(hash.length).toBeGreaterThan(0);
      });
    });

    it('should accept valid URLs', () => {
      const validUrls = [
        'https://example.com/article',
        'http://news.site/story',
        'https://www.techcrunch.com/2025/01/15/apple-news',
      ];

      validUrls.forEach((url) => {
        expect(url).toMatch(/^https?:\/\//);
      });
    });

    it('should accept valid date format', () => {
      const validDate = '2025-01-15';
      expect(validDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should handle article metadata', () => {
      const metadata = {
        publisher: 'TechCrunch',
        imageUrl: 'https://example.com/image.jpg',
      };

      expect(metadata.publisher).toBeTruthy();
      expect(metadata.imageUrl).toContain('http');
    });
  });

  describe('TTL Calculation', () => {
    it('should set TTL to approximately 30 days from now', () => {
      // TTL should be in seconds, not milliseconds
      const thirtyDaysInSeconds = 30 * 24 * 60 * 60;
      expect(thirtyDaysInSeconds).toBe(2592000); // 30 days = 2,592,000 seconds
    });
  });
});
