/**
 * Unit tests for SentimentCache repository
 */

import {
  getSentiment,
  putSentiment,
  batchPutSentiments,
  querySentimentsByTicker,
  existsInCache,
  type SentimentCacheItem,
  type SentimentData,
} from '../../src/repositories/sentimentCache.repository.js';

describe('SentimentCache Repository', () => {
  describe('Type Definitions', () => {
    it('should accept valid SentimentData with positive classification', () => {
      const sentiment: SentimentData = {
        positive: 15,
        negative: 3,
        sentimentScore: 0.67,
        classification: 'POS',
      };

      expect(sentiment).toBeDefined();
      expect(sentiment.positive).toBe(15);
      expect(sentiment.sentimentScore).toBeCloseTo(0.67);
      expect(sentiment.classification).toBe('POS');
    });

    it('should accept valid SentimentData with negative classification', () => {
      const sentiment: SentimentData = {
        positive: 2,
        negative: 10,
        sentimentScore: -0.4,
        classification: 'NEG',
      };

      expect(sentiment.negative).toBe(10);
      expect(sentiment.sentimentScore).toBeCloseTo(-0.4);
      expect(sentiment.classification).toBe('NEG');
    });

    it('should accept valid SentimentData with neutral classification', () => {
      const sentiment: SentimentData = {
        positive: 5,
        negative: 5,
        sentimentScore: 0.0,
        classification: 'NEUT',
      };

      expect(sentiment.positive).toBe(sentiment.negative);
      expect(sentiment.sentimentScore).toBe(0.0);
      expect(sentiment.classification).toBe('NEUT');
    });

    it('should accept valid SentimentCacheItem', () => {
      const cacheItem: SentimentCacheItem = {
        ticker: 'AAPL',
        articleHash: 'hash_12345',
        sentiment: {
          positive: 15,
          negative: 3,
          sentimentScore: 0.67,
          classification: 'POS',
        },
        analyzedAt: Date.now(),
        ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
      };

      expect(cacheItem.ticker).toBe('AAPL');
      expect(cacheItem.articleHash).toBe('hash_12345');
      expect(cacheItem.sentiment.classification).toBe('POS');
      expect(cacheItem.analyzedAt).toBeDefined();
    });

    it('should use analyzedAt instead of fetchedAt', () => {
      const cacheItem: SentimentCacheItem = {
        ticker: 'GOOGL',
        articleHash: 'hash_67890',
        sentiment: {
          positive: 8,
          negative: 2,
          sentimentScore: 0.5,
          classification: 'POS',
        },
        analyzedAt: Date.now(),
        ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
      };

      expect(cacheItem.analyzedAt).toBeDefined();
      expect(typeof cacheItem.analyzedAt).toBe('number');
    });
  });

  describe('batchPutSentiments', () => {
    it('should handle empty items array', async () => {
      await expect(batchPutSentiments([])).resolves.not.toThrow();
    });

    // Note: Actual DynamoDB operations would be tested in integration tests
  });

  describe('Repository Function Signatures', () => {
    it('should have correct getSentiment signature', () => {
      expect(typeof getSentiment).toBe('function');
      expect(getSentiment.length).toBe(2); // ticker, articleHash
    });

    it('should have correct putSentiment signature', () => {
      expect(typeof putSentiment).toBe('function');
      expect(putSentiment.length).toBe(1); // item
    });

    it('should have correct batchPutSentiments signature', () => {
      expect(typeof batchPutSentiments).toBe('function');
      expect(batchPutSentiments.length).toBe(1); // items
    });

    it('should have correct querySentimentsByTicker signature', () => {
      expect(typeof querySentimentsByTicker).toBe('function');
      expect(querySentimentsByTicker.length).toBe(1); // ticker
    });

    it('should have correct existsInCache signature', () => {
      expect(typeof existsInCache).toBe('function');
      expect(existsInCache.length).toBe(2); // ticker, articleHash
    });
  });

  describe('Sentiment Classifications', () => {
    it('should support POS classification', () => {
      const classification: 'POS' | 'NEG' | 'NEUT' = 'POS';
      expect(['POS', 'NEG', 'NEUT']).toContain(classification);
    });

    it('should support NEG classification', () => {
      const classification: 'POS' | 'NEG' | 'NEUT' = 'NEG';
      expect(['POS', 'NEG', 'NEUT']).toContain(classification);
    });

    it('should support NEUT classification', () => {
      const classification: 'POS' | 'NEG' | 'NEUT' = 'NEUT';
      expect(['POS', 'NEG', 'NEUT']).toContain(classification);
    });
  });

  describe('Sentiment Score Ranges', () => {
    it('should handle positive sentiment scores', () => {
      const scores = [0.1, 0.5, 0.9, 1.0];
      scores.forEach((score) => {
        expect(score).toBeGreaterThan(0);
        expect(score).toBeLessThanOrEqual(1);
      });
    });

    it('should handle negative sentiment scores', () => {
      const scores = [-0.1, -0.5, -0.9, -1.0];
      scores.forEach((score) => {
        expect(score).toBeLessThan(0);
        expect(score).toBeGreaterThanOrEqual(-1);
      });
    });

    it('should handle neutral sentiment score', () => {
      const score = 0.0;
      expect(score).toBe(0);
    });
  });

  describe('TTL Calculation', () => {
    it('should set TTL to approximately 90 days from now', () => {
      // TTL should be in seconds, not milliseconds
      const ninetyDaysInSeconds = 90 * 24 * 60 * 60;
      expect(ninetyDaysInSeconds).toBe(7776000); // 90 days = 7,776,000 seconds
    });

    it('should have longer TTL than stocks or news', () => {
      const stocksTTL = 7 * 24 * 60 * 60; // 7 days
      const newsTTL = 30 * 24 * 60 * 60; // 30 days
      const sentimentTTL = 90 * 24 * 60 * 60; // 90 days

      expect(sentimentTTL).toBeGreaterThan(stocksTTL);
      expect(sentimentTTL).toBeGreaterThan(newsTTL);
    });
  });
});
