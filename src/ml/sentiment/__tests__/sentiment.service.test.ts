/**
 * Tests for Sentiment Service Wrapper
 */

import {
  analyzeSentiment,
  analyzeSentimentWithMetrics,
  getPerformanceStats,
  resetPerformanceStats,
} from '../sentiment.service';
import { getSentimentAnalyzer, resetSentimentAnalyzer } from '../analyzer';
import type { SentimentAnalysisResponse } from '@/types/api.types';

describe('Sentiment Service', () => {
  beforeEach(() => {
    resetSentimentAnalyzer();
    resetPerformanceStats();
  });

  describe('analyzeSentiment', () => {
    it('should return result matching SentimentAnalysisResponse type', async () => {
      const articleText = 'The company reported strong earnings and beat expectations.';
      const hash = 'test-hash-001';

      const result = await analyzeSentiment(articleText, hash);

      // Check type structure
      expect(result).toHaveProperty('positive');
      expect(result).toHaveProperty('neutral');
      expect(result).toHaveProperty('negative');
      expect(result).toHaveProperty('hash');

      // Check format
      expect(Array.isArray(result.positive)).toBe(true);
      expect(result.positive).toHaveLength(2);
      expect(Array.isArray(result.neutral)).toBe(true);
      expect(result.neutral).toHaveLength(2);
      expect(Array.isArray(result.negative)).toBe(true);
      expect(result.negative).toHaveLength(2);

      // Check hash
      expect(result.hash).toBe(hash);
    });

    it('should return valid count and confidence strings', async () => {
      const articleText = 'Good news. Bad news. Neutral news.';
      const hash = 'test-hash-002';

      const result = await analyzeSentiment(articleText, hash);

      // All counts should be numeric strings
      expect(result.positive[0]).toMatch(/^\d+$/);
      expect(result.neutral[0]).toMatch(/^\d+$/);
      expect(result.negative[0]).toMatch(/^\d+$/);

      // All confidences should be formatted to 2 decimals
      expect(result.positive[1]).toMatch(/^\d+\.\d{2}$/);
      expect(result.neutral[1]).toMatch(/^\d+\.\d{2}$/);
      expect(result.negative[1]).toMatch(/^\d+\.\d{2}$/);
    });

    it('should handle empty text gracefully', async () => {
      const result = await analyzeSentiment('', 'empty-hash');

      expect(result.positive[0]).toBe('0');
      expect(result.neutral[0]).toBe('0');
      expect(result.negative[0]).toBe('0');
    });

    it('should handle very long articles', async () => {
      const longArticle = Array(50)
        .fill('The company announced positive earnings results.')
        .join(' ');

      const result = await analyzeSentiment(longArticle, 'long-hash');

      const totalCount =
        parseInt(result.positive[0]) +
        parseInt(result.neutral[0]) +
        parseInt(result.negative[0]);

      expect(totalCount).toBeGreaterThan(40);
    });

    it('should complete quickly for typical articles', async () => {
      const articleText =
        'The company reported strong quarterly earnings. Revenue grew significantly. ' +
        'Analysts are optimistic about future performance.';

      const startTime = performance.now();
      await analyzeSentiment(articleText, 'perf-hash');
      const duration = performance.now() - startTime;

      // Should complete in under 100ms
      expect(duration).toBeLessThan(100);
    });

    it('should throw error if analyzer fails', async () => {
      // Mock analyzer to throw error
      const analyzer = getSentimentAnalyzer();
      const originalAnalyze = analyzer.analyze;
      analyzer.analyze = () => {
        throw new Error('Analyzer failure');
      };

      await expect(
        analyzeSentiment('Test text', 'error-hash')
      ).rejects.toThrow('Browser sentiment analysis failed');

      // Restore
      analyzer.analyze = originalAnalyze;
    });
  });

  describe('analyzeSentimentWithMetrics', () => {
    it('should return same result as analyzeSentiment', async () => {
      const articleText = 'Positive earnings announcement.';
      const hash = 'metrics-hash';

      const result1 = await analyzeSentiment(articleText, hash);
      resetSentimentAnalyzer(); // Reset to ensure same analyzer state

      const result2 = await analyzeSentimentWithMetrics(articleText, hash);

      // Results should be equivalent (but hash might differ due to different instances)
      expect(result1.positive[0]).toBe(result2.positive[0]);
      expect(result1.neutral[0]).toBe(result2.neutral[0]);
      expect(result1.negative[0]).toBe(result2.negative[0]);
    });

    it('should record performance metrics', async () => {
      resetPerformanceStats();

      const articleText = 'Good news about the company.';

      await analyzeSentimentWithMetrics(articleText, 'test-1');
      await analyzeSentimentWithMetrics(articleText, 'test-2');
      await analyzeSentimentWithMetrics(articleText, 'test-3');

      const stats = getPerformanceStats();

      expect(stats.count).toBe(3);
      expect(stats.mean).toBeGreaterThan(0);
      expect(stats.median).toBeGreaterThan(0);
      expect(stats.p95).toBeGreaterThan(0);
      expect(stats.p99).toBeGreaterThan(0);
    });
  });

  describe('Performance Tracking', () => {
    it('should return empty stats initially', () => {
      resetPerformanceStats();
      const stats = getPerformanceStats();

      expect(stats.count).toBe(0);
      expect(stats.mean).toBe(0);
      expect(stats.median).toBe(0);
      expect(stats.p95).toBe(0);
      expect(stats.p99).toBe(0);
    });

    it('should calculate correct statistics', async () => {
      resetPerformanceStats();

      const articleText = 'Test article for metrics.';

      // Run multiple analyses
      for (let i = 0; i < 10; i++) {
        await analyzeSentimentWithMetrics(articleText, `test-${i}`);
      }

      const stats = getPerformanceStats();

      expect(stats.count).toBe(10);
      expect(stats.mean).toBeGreaterThanOrEqual(0);
      expect(stats.mean).toBeLessThan(100); // Should be fast
      expect(stats.median).toBeGreaterThanOrEqual(0); // May be 0 if very fast
      expect(stats.p95).toBeGreaterThanOrEqual(0);
      expect(stats.p99).toBeGreaterThanOrEqual(0);

      // p95 should be >= median
      expect(stats.p95).toBeGreaterThanOrEqual(stats.median);
    });

    it('should reset statistics', async () => {
      resetPerformanceStats();

      await analyzeSentimentWithMetrics('Test', 'test-1');

      let stats = getPerformanceStats();
      expect(stats.count).toBe(1);

      resetPerformanceStats();

      stats = getPerformanceStats();
      expect(stats.count).toBe(0);
    });

    it('should limit samples to max size', async () => {
      resetPerformanceStats();

      // Run more than max samples (100)
      const articleText = 'Test';
      for (let i = 0; i < 150; i++) {
        await analyzeSentimentWithMetrics(articleText, `test-${i}`);
      }

      const stats = getPerformanceStats();

      // Should cap at 100
      expect(stats.count).toBe(100);
    });
  });

  describe('API Compatibility', () => {
    it('should match existing sentiment.service.ts interface', async () => {
      // This test verifies that the new service has the same function signature
      // as the old API service, allowing drop-in replacement

      const articleText = 'The stock price surged after strong earnings.';
      const hash = 'compat-hash';

      // Function should accept (articleText: string, hash: string)
      const result: SentimentAnalysisResponse = await analyzeSentiment(
        articleText,
        hash
      );

      // Should return SentimentAnalysisResponse type
      expect(result).toBeDefined();
      expect(typeof result.positive[0]).toBe('string');
      expect(typeof result.positive[1]).toBe('string');
      expect(typeof result.hash).toBe('string');
    });

    it('should work with promise chaining like API service', async () => {
      // Verify async behavior matches API service
      const result = await analyzeSentiment('Test text', 'chain-hash')
        .then((res) => {
          expect(res).toBeDefined();
          return res;
        })
        .catch((err) => {
          fail('Should not reject');
        });

      expect(result).toBeDefined();
    });

    it('should log to console like API service', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await analyzeSentiment('Test logging', 'log-hash');

      // Should have logged completion message
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ML SentimentService] Analysis complete')
      );

      consoleSpy.mockRestore();
    });

    it('should log errors to console', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const analyzer = getSentimentAnalyzer();
      const originalAnalyze = analyzer.analyze;

      analyzer.analyze = () => {
        throw new Error('Test error');
      };

      try {
        await analyzeSentiment('Test', 'error-hash');
      } catch (error) {
        // Expected
      }

      // Should have logged error
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ML SentimentService] Error'),
        expect.any(Error)
      );

      analyzer.analyze = originalAnalyze;
      consoleSpy.mockRestore();
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle financial news article', async () => {
      const article =
        'Apple Inc. announced record quarterly earnings, beating analyst expectations. ' +
        'Revenue grew 15% year-over-year to $90 billion. ' +
        'The company\'s stock surged 8% in after-hours trading. ' +
        'CEO Tim Cook praised the team\'s execution and innovation.';

      const result = await analyzeSentiment(article, 'apple-earnings');

      const posCount = parseInt(result.positive[0]);

      // Should detect positive sentiment
      expect(posCount).toBeGreaterThan(0);
    });

    it('should handle bearish news', async () => {
      const article =
        'Tesla shares plummeted after disappointing quarterly results. ' +
        'The company missed revenue estimates by 10%. ' +
        'Analysts downgraded the stock citing mounting losses. ' +
        'Investors worry about increasing competition.';

      const result = await analyzeSentiment(article, 'tesla-earnings');

      const negCount = parseInt(result.negative[0]);

      // Should detect negative sentiment
      expect(negCount).toBeGreaterThan(0);
    });

    it('should handle neutral news', async () => {
      const article =
        'Microsoft announced quarterly results today. ' +
        'The company reported revenue in line with expectations. ' +
        'Analysts maintained their neutral ratings.';

      const result = await analyzeSentiment(article, 'msft-earnings');

      const neutCount = parseInt(result.neutral[0]);

      // Should have some neutral classification
      expect(neutCount).toBeGreaterThan(0);
    });
  });
});
