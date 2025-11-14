/**
 * Tests for hash utility functions
 */

import { describe, it, expect } from '@jest/globals';
import {
  generateArticleHash,
  isValidHash,
  generateArticleHashes,
} from '../../src/utils/hash.util';

describe('Hash Utility', () => {
  describe('generateArticleHash', () => {
    it('should generate consistent hash for same URL', () => {
      const url = 'https://example.com/article';
      const hash1 = generateArticleHash(url);
      const hash2 = generateArticleHash(url);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(16);
    });

    it('should generate different hashes for different URLs', () => {
      const url1 = 'https://example.com/article1';
      const url2 = 'https://example.com/article2';

      const hash1 = generateArticleHash(url1);
      const hash2 = generateArticleHash(url2);

      expect(hash1).not.toBe(hash2);
    });

    it('should normalize URLs to lowercase', () => {
      const url1 = 'https://EXAMPLE.com/Article';
      const url2 = 'https://example.com/article';

      const hash1 = generateArticleHash(url1);
      const hash2 = generateArticleHash(url2);

      expect(hash1).toBe(hash2);
    });

    it('should trim whitespace from URLs', () => {
      const url1 = '  https://example.com/article  ';
      const url2 = 'https://example.com/article';

      const hash1 = generateArticleHash(url1);
      const hash2 = generateArticleHash(url2);

      expect(hash1).toBe(hash2);
    });

    it('should handle URLs with special characters', () => {
      const url = 'https://example.com/article?id=123&category=tech';

      expect(() => generateArticleHash(url)).not.toThrow();
      const hash = generateArticleHash(url);
      expect(hash).toHaveLength(16);
      expect(isValidHash(hash)).toBe(true);
    });

    it('should throw error for empty URL', () => {
      expect(() => generateArticleHash('')).toThrow();
    });

    it('should throw error for whitespace-only URL', () => {
      expect(() => generateArticleHash('   ')).toThrow();
    });

    it('should throw error for null or undefined', () => {
      expect(() => generateArticleHash(null as any)).toThrow('URL must be a non-empty string');
      expect(() => generateArticleHash(undefined as any)).toThrow('URL must be a non-empty string');
    });

    it('should throw error for non-string input', () => {
      expect(() => generateArticleHash(123 as any)).toThrow('URL must be a non-empty string');
      expect(() => generateArticleHash({} as any)).toThrow('URL must be a non-empty string');
    });

    it('should generate hex string (0-9, a-f only)', () => {
      const url = 'https://example.com/article';
      const hash = generateArticleHash(url);

      expect(/^[0-9a-f]{16}$/.test(hash)).toBe(true);
    });

    it('should generate unique hashes for large dataset', () => {
      // Test collision resistance with 1000 unique URLs
      const urls = Array.from({ length: 1000 }, (_, i) => `https://example.com/article/${i}`);
      const hashes = urls.map((url) => generateArticleHash(url));

      // All hashes should be unique
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(1000);
    });

    it('should generate same hash 100 times for same URL', () => {
      const url = 'https://example.com/article';
      const firstHash = generateArticleHash(url);

      // Generate 100 times and verify consistency
      for (let i = 0; i < 100; i++) {
        const hash = generateArticleHash(url);
        expect(hash).toBe(firstHash);
      }
    });
  });

  describe('isValidHash', () => {
    it('should return true for valid hash', () => {
      const validHash = generateArticleHash('https://example.com/article');
      expect(isValidHash(validHash)).toBe(true);
    });

    it('should return true for manually created valid hash', () => {
      expect(isValidHash('a1b2c3d4e5f6a7b8')).toBe(true);
      expect(isValidHash('0123456789abcdef')).toBe(true);
    });

    it('should return false for invalid length', () => {
      expect(isValidHash('abc123')).toBe(false); // Too short
      expect(isValidHash('a1b2c3d4e5f6g7h8i9')).toBe(false); // Too long
    });

    it('should return false for non-hex characters', () => {
      expect(isValidHash('g1h2i3j4k5l6m7n8')).toBe(false); // Contains g-n
      expect(isValidHash('ABCD1234EFGH5678')).toBe(false); // Uppercase
      expect(isValidHash('a1b2-c3d4-e5f6-g7')).toBe(false); // Contains hyphens
    });

    it('should return false for empty string', () => {
      expect(isValidHash('')).toBe(false);
    });

    it('should return false for null or undefined', () => {
      expect(isValidHash(null as any)).toBe(false);
      expect(isValidHash(undefined as any)).toBe(false);
    });

    it('should return false for non-string input', () => {
      expect(isValidHash(123 as any)).toBe(false);
      expect(isValidHash({} as any)).toBe(false);
    });
  });

  describe('generateArticleHashes', () => {
    it('should generate hashes for multiple URLs', () => {
      const urls = [
        'https://example.com/article1',
        'https://example.com/article2',
        'https://example.com/article3',
      ];

      const hashes = generateArticleHashes(urls);

      expect(hashes).toHaveLength(3);
      expect(hashes[0]).not.toBe(hashes[1]);
      expect(hashes[1]).not.toBe(hashes[2]);
      expect(hashes[0]).not.toBe(hashes[2]);
    });

    it('should maintain order of input URLs', () => {
      const urls = [
        'https://example.com/article1',
        'https://example.com/article2',
        'https://example.com/article3',
      ];

      const hashes = generateArticleHashes(urls);

      // Verify order by generating individual hashes
      expect(hashes[0]).toBe(generateArticleHash(urls[0]));
      expect(hashes[1]).toBe(generateArticleHash(urls[1]));
      expect(hashes[2]).toBe(generateArticleHash(urls[2]));
    });

    it('should handle empty array', () => {
      const hashes = generateArticleHashes([]);
      expect(hashes).toEqual([]);
    });

    it('should handle large batch (100 URLs)', () => {
      const urls = Array.from({ length: 100 }, (_, i) => `https://example.com/article/${i}`);
      const hashes = generateArticleHashes(urls);

      expect(hashes).toHaveLength(100);

      // All should be valid hashes
      hashes.forEach((hash) => {
        expect(isValidHash(hash)).toBe(true);
      });

      // All should be unique
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(100);
    });

    it('should throw error if any URL is invalid', () => {
      const urls = ['https://example.com/article1', '', 'https://example.com/article3'];

      expect(() => generateArticleHashes(urls)).toThrow();
    });

    it('should throw error for non-array input', () => {
      expect(() => generateArticleHashes('not-an-array' as any)).toThrow('URLs must be an array');
      expect(() => generateArticleHashes(null as any)).toThrow('URLs must be an array');
    });
  });

  describe('Hash collision resistance', () => {
    it('should not collide on similar URLs', () => {
      const similarUrls = [
        'https://example.com/article',
        'https://example.com/articles',
        'https://example.com/article1',
        'https://example.com/article-1',
        'https://example.com/article?id=1',
      ];

      const hashes = generateArticleHashes(similarUrls);
      const uniqueHashes = new Set(hashes);

      expect(uniqueHashes.size).toBe(similarUrls.length);
    });
  });
});
