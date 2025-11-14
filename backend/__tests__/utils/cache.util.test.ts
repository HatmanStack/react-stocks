/**
 * Unit tests for cache utilities
 */

import {
  calculateTTL,
  isCacheFresh,
  generateCacheKey,
  parseCacheKey,
} from '../../src/utils/cache.util.js';

describe('Cache Utilities', () => {
  describe('calculateTTL', () => {
    it('should calculate TTL for 7 days from now', () => {
      const now = Date.now();
      const ttl = calculateTTL(7);

      // TTL should be approximately 7 days from now (in seconds)
      const expectedTTL = Math.floor((now + 7 * 24 * 60 * 60 * 1000) / 1000);

      // Allow 1 second variance due to execution time
      expect(ttl).toBeGreaterThanOrEqual(expectedTTL - 1);
      expect(ttl).toBeLessThanOrEqual(expectedTTL + 1);
    });

    it('should calculate TTL for 30 days from now', () => {
      const now = Date.now();
      const ttl = calculateTTL(30);

      const expectedTTL = Math.floor((now + 30 * 24 * 60 * 60 * 1000) / 1000);

      expect(ttl).toBeGreaterThanOrEqual(expectedTTL - 1);
      expect(ttl).toBeLessThanOrEqual(expectedTTL + 1);
    });

    it('should calculate TTL for 90 days from now', () => {
      const now = Date.now();
      const ttl = calculateTTL(90);

      const expectedTTL = Math.floor((now + 90 * 24 * 60 * 60 * 1000) / 1000);

      expect(ttl).toBeGreaterThanOrEqual(expectedTTL - 1);
      expect(ttl).toBeLessThanOrEqual(expectedTTL + 1);
    });

    it('should return Unix timestamp in seconds, not milliseconds', () => {
      const ttl = calculateTTL(1);

      // Unix timestamp in seconds should be 10 digits (as of 2025)
      expect(ttl.toString().length).toBe(10);
    });

    it('should handle zero days', () => {
      const now = Date.now();
      const ttl = calculateTTL(0);

      const expectedTTL = Math.floor(now / 1000);

      expect(ttl).toBeGreaterThanOrEqual(expectedTTL - 1);
      expect(ttl).toBeLessThanOrEqual(expectedTTL + 1);
    });
  });

  describe('isCacheFresh', () => {
    it('should return true for fresh cache (within max age)', () => {
      const fetchedAt = Date.now() - 2 * 60 * 1000; // 2 minutes ago
      const maxAgeMs = 5 * 60 * 1000; // 5 minutes

      expect(isCacheFresh(fetchedAt, maxAgeMs)).toBe(true);
    });

    it('should return false for stale cache (exceeds max age)', () => {
      const fetchedAt = Date.now() - 10 * 60 * 1000; // 10 minutes ago
      const maxAgeMs = 5 * 60 * 1000; // 5 minutes

      expect(isCacheFresh(fetchedAt, maxAgeMs)).toBe(false);
    });

    it('should return true for cache exactly at max age boundary', () => {
      const maxAgeMs = 5 * 60 * 1000;
      const fetchedAt = Date.now() - maxAgeMs + 100; // Just under max age

      expect(isCacheFresh(fetchedAt, maxAgeMs)).toBe(true);
    });

    it('should return false for cache just over max age', () => {
      const maxAgeMs = 5 * 60 * 1000;
      const fetchedAt = Date.now() - maxAgeMs - 100; // Just over max age

      expect(isCacheFresh(fetchedAt, maxAgeMs)).toBe(false);
    });

    it('should handle zero max age', () => {
      const fetchedAt = Date.now() - 1000; // 1 second ago
      const maxAgeMs = 0;

      expect(isCacheFresh(fetchedAt, maxAgeMs)).toBe(false);
    });

    it('should return true for freshly cached item (now)', () => {
      const fetchedAt = Date.now();
      const maxAgeMs = 5 * 60 * 1000;

      expect(isCacheFresh(fetchedAt, maxAgeMs)).toBe(true);
    });
  });

  describe('generateCacheKey', () => {
    it('should generate cache key from ticker and date', () => {
      const key = generateCacheKey('AAPL', '2025-01-15');
      expect(key).toBe('AAPL#2025-01-15');
    });

    it('should uppercase ticker symbol', () => {
      const key = generateCacheKey('aapl', '2025-01-15');
      expect(key).toBe('AAPL#2025-01-15');
    });

    it('should handle lowercase ticker', () => {
      const key = generateCacheKey('googl', '2025-01-15');
      expect(key).toBe('GOOGL#2025-01-15');
    });

    it('should handle mixed case ticker', () => {
      const key = generateCacheKey('TsLa', '2025-01-15');
      expect(key).toBe('TSLA#2025-01-15');
    });

    it('should generate consistent keys for same inputs', () => {
      const key1 = generateCacheKey('AAPL', '2025-01-15');
      const key2 = generateCacheKey('aapl', '2025-01-15');

      expect(key1).toBe(key2);
    });
  });

  describe('parseCacheKey', () => {
    it('should parse cache key into ticker and date', () => {
      const result = parseCacheKey('AAPL#2025-01-15');

      expect(result).toEqual({
        ticker: 'AAPL',
        date: '2025-01-15',
      });
    });

    it('should handle different tickers', () => {
      const result = parseCacheKey('GOOGL#2025-12-31');

      expect(result).toEqual({
        ticker: 'GOOGL',
        date: '2025-12-31',
      });
    });

    it('should be inverse of generateCacheKey', () => {
      const ticker = 'AAPL';
      const date = '2025-01-15';

      const key = generateCacheKey(ticker, date);
      const parsed = parseCacheKey(key);

      expect(parsed.ticker).toBe(ticker.toUpperCase());
      expect(parsed.date).toBe(date);
    });

    it('should throw error for malformed cache key (no delimiter)', () => {
      expect(() => parseCacheKey('AAPL')).toThrow('Invalid cacheKey format');
    });

    it('should throw error for malformed cache key (too many parts)', () => {
      expect(() => parseCacheKey('AAPL#2025-01-15#EXTRA')).toThrow('Invalid cacheKey format');
    });

    it('should throw error for empty ticker', () => {
      expect(() => parseCacheKey('#2025-01-15')).toThrow('Invalid cacheKey format');
    });

    it('should throw error for empty date', () => {
      expect(() => parseCacheKey('AAPL#')).toThrow('Invalid cacheKey format');
    });
  });
});
