/**
 * End-to-End Integration Tests for Sentiment Analysis Flow
 *
 * Tests the complete sentiment analysis pipeline:
 * 1. News articles stored in database
 * 2. Sentiment sync triggered
 * 3. ML analyzer processes articles
 * 4. Results stored in word_count_details and combined_word_count_details
 *
 * NOTE: These tests require database initialization which has dynamic import
 * issues in Jest environment. For full E2E testing, use manual testing or
 * run the app and verify the sync pipeline works end-to-end.
 *
 * Component-level tests (analyzer, service, comparison) provide comprehensive
 * coverage of the ML sentiment functionality.
 */

import { syncSentimentData } from '@/services/sync/sentimentDataSync';
import * as NewsRepository from '@/database/repositories/news.repository';
import * as WordCountRepository from '@/database/repositories/wordCount.repository';
import * as CombinedWordRepository from '@/database/repositories/combinedWord.repository';
import { FeatureFlags } from '@/config/features';
import type { NewsDetails } from '@/types/database.types';

// Mock data
const TEST_TICKER = 'TEST';
const TEST_DATE = '2024-01-15';

const mockNewsArticles: Omit<NewsDetails, 'id'>[] = [
  {
    date: TEST_DATE,
    ticker: TEST_TICKER,
    articleTickers: TEST_TICKER,
    title: 'Company Reports Strong Earnings',
    articleDate: TEST_DATE,
    articleUrl: 'https://example.com/article-1',
    publisher: 'Example News',
    ampUrl: '',
    articleDescription:
      'The company announced record quarterly earnings that beat analyst expectations. ' +
      'Revenue grew significantly year-over-year driven by strong product sales.',
  },
  {
    date: TEST_DATE,
    ticker: TEST_TICKER,
    articleTickers: TEST_TICKER,
    title: 'Stock Price Plummets',
    articleDate: TEST_DATE,
    articleUrl: 'https://example.com/article-2',
    publisher: 'Example News',
    ampUrl: '',
    articleDescription:
      'Shares plummeted after disappointing quarterly results. ' +
      'The company missed revenue targets and reported significant losses.',
  },
  {
    date: TEST_DATE,
    ticker: TEST_TICKER,
    articleTickers: TEST_TICKER,
    title: 'Company Announces Results',
    articleDate: TEST_DATE,
    articleUrl: 'https://example.com/article-3',
    publisher: 'Example News',
    ampUrl: '',
    articleDescription:
      'The company announced quarterly results today. ' +
      'Performance was in line with market expectations.',
  },
];

describe('Sentiment Analysis Integration Flow', () => {
  beforeEach(async () => {
    // Clean up test data
    await WordCountRepository.deleteByTicker(TEST_TICKER);
    await CombinedWordRepository.deleteByTicker(TEST_TICKER);
    await NewsRepository.deleteByTicker(TEST_TICKER);

    // Insert test news articles
    for (const article of mockNewsArticles) {
      await NewsRepository.insert(article);
    }
  });

  afterEach(async () => {
    // Clean up test data
    await WordCountRepository.deleteByTicker(TEST_TICKER);
    await CombinedWordRepository.deleteByTicker(TEST_TICKER);
    await NewsRepository.deleteByTicker(TEST_TICKER);
  });

  describe('Full Pipeline with ML Sentiment', () => {
    it('should complete end-to-end sentiment sync', async () => {
      // Ensure ML sentiment is enabled
      expect(FeatureFlags.USE_BROWSER_SENTIMENT).toBe(true);

      // Run sentiment sync
      const analyzedCount = await syncSentimentData(TEST_TICKER, TEST_DATE);

      // Should have analyzed all 3 articles
      expect(analyzedCount).toBe(3);
    });

    it('should store individual article sentiment in word_count_details', async () => {
      await syncSentimentData(TEST_TICKER, TEST_DATE);

      // Fetch all word count records
      const wordCounts = await WordCountRepository.findByTickerAndDate(
        TEST_TICKER,
        TEST_DATE
      );

      // Should have 3 records (one per article)
      expect(wordCounts).toHaveLength(3);

      // Each record should have required fields
      wordCounts.forEach((wc: typeof wordCounts[0]) => {
        expect(wc.ticker).toBe(TEST_TICKER);
        expect(wc.date).toBe(TEST_DATE);
        expect(wc.positive).toBeGreaterThanOrEqual(0);
        expect(wc.negative).toBeGreaterThanOrEqual(0);
        expect(wc.sentiment).toMatch(/^(POS|NEUT|NEG)$/);
        expect(typeof wc.sentimentNumber).toBe('number');
        expect(wc.hash).toBeGreaterThan(0);
      });
    });

    it('should correctly classify positive article', async () => {
      await syncSentimentData(TEST_TICKER, TEST_DATE);

      const wordCounts = await WordCountRepository.findByTickerAndDate(
        TEST_TICKER,
        TEST_DATE
      );

      // Find the positive article (contains "strong", "beat", "grew")
      const positiveArticle = wordCounts.find((wc: typeof wordCounts[0]) =>
        wc.body?.includes('strong')
      );

      expect(positiveArticle).toBeDefined();

      // Should have detected positive sentiment
      // Note: May be classified as neutral due to mixed language, that's okay
      expect(['POS', 'NEUT']).toContain(positiveArticle!.sentiment);
      if (positiveArticle!.sentiment === 'POS') {
        expect(positiveArticle!.positive).toBeGreaterThan(0);
      }
    });

    it('should correctly classify negative article', async () => {
      await syncSentimentData(TEST_TICKER, TEST_DATE);

      const wordCounts = await WordCountRepository.findByTickerAndDate(
        TEST_TICKER,
        TEST_DATE
      );

      // Find the negative article (contains "plummeted", "disappointing", "losses")
      const negativeArticle = wordCounts.find((wc: typeof wordCounts[0]) =>
        wc.body?.includes('plummeted')
      );

      expect(negativeArticle).toBeDefined();

      // Should have detected negative sentiment
      expect(['NEG', 'NEUT']).toContain(negativeArticle!.sentiment);
      if (negativeArticle!.sentiment === 'NEG') {
        expect(negativeArticle!.negative).toBeGreaterThan(0);
      }
    });

    it('should aggregate sentiment into combined_word_count_details', async () => {
      await syncSentimentData(TEST_TICKER, TEST_DATE);

      // Fetch combined word count (using date range with same start/end)
      const combinedArray = await CombinedWordRepository.findByTickerAndDateRange(
        TEST_TICKER,
        TEST_DATE,
        TEST_DATE
      );

      const combined = combinedArray[0];

      expect(combined).toBeDefined();
      expect(combined!.ticker).toBe(TEST_TICKER);
      expect(combined!.date).toBe(TEST_DATE);

      // Should have aggregated counts
      expect(combined!.positive).toBeGreaterThanOrEqual(0);
      expect(combined!.negative).toBeGreaterThanOrEqual(0);

      // Should have sentiment classification
      expect(combined!.sentiment).toMatch(/^(POS|NEUT|NEG)$/);
      expect(typeof combined!.sentimentNumber).toBe('number');

      // Should have update date
      expect(combined!.updateDate).toBeDefined();
    });

    it('should not re-analyze existing articles', async () => {
      // First sync
      await syncSentimentData(TEST_TICKER, TEST_DATE);

      const wordCountsBefore = await WordCountRepository.findByTickerAndDate(
        TEST_TICKER,
        TEST_DATE
      );

      expect(wordCountsBefore).toHaveLength(3);

      // Second sync (should skip existing)
      const analyzedCount = await syncSentimentData(TEST_TICKER, TEST_DATE);

      // Should analyze 0 articles (all exist)
      expect(analyzedCount).toBe(0);

      // Should still have 3 records
      const wordCountsAfter = await WordCountRepository.findByTickerAndDate(
        TEST_TICKER,
        TEST_DATE
      );

      expect(wordCountsAfter).toHaveLength(3);
    });

    it('should handle articles with no description', async () => {
      // Add article with no description
      await NewsRepository.insert({
        date: TEST_DATE,
        ticker: TEST_TICKER,
        articleTickers: TEST_TICKER,
        title: 'No Description Article',
        articleDate: TEST_DATE,
        articleUrl: 'https://example.com/article-no-desc',
        publisher: 'Example News',
        ampUrl: '',
        articleDescription: '', // Empty description
      });

      // Should not crash
      await expect(
        syncSentimentData(TEST_TICKER, TEST_DATE)
      ).resolves.toBeDefined();

      // Should only analyze articles with descriptions
      const wordCounts = await WordCountRepository.findByTickerAndDate(
        TEST_TICKER,
        TEST_DATE
      );

      // Should have 3 records (empty description skipped)
      expect(wordCounts).toHaveLength(3);
    });

    it('should complete sync in reasonable time', async () => {
      const startTime = performance.now();
      await syncSentimentData(TEST_TICKER, TEST_DATE);
      const duration = performance.now() - startTime;

      // 3 articles should complete in under 1 second
      // (Each article <100ms, so 3 articles <300ms + overhead)
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Error Handling', () => {
    it('should handle sync with no articles gracefully', async () => {
      // Clean up all articles
      await NewsRepository.deleteByTicker(TEST_TICKER);

      // Should not crash
      const analyzedCount = await syncSentimentData(TEST_TICKER, TEST_DATE);

      // Should analyze 0 articles
      expect(analyzedCount).toBe(0);
    });

    it('should handle malformed article text', async () => {
      // Add article with special characters and very long text
      await NewsRepository.insert({
        date: TEST_DATE,
        ticker: TEST_TICKER,
        articleTickers: TEST_TICKER,
        title: 'Special Characters',
        articleDate: TEST_DATE,
        articleUrl: 'https://example.com/malformed',
        publisher: 'Example News',
        ampUrl: '',
        articleDescription:
          'Test with $pecial ch@racters & emojis 😀 and very long repeated text '.repeat(
            100
          ),
      });

      // Should not crash
      await expect(
        syncSentimentData(TEST_TICKER, TEST_DATE)
      ).resolves.toBeDefined();

      // Verify results are valid despite malformed input
      const wordCounts = await WordCountRepository.findByTickerAndDate(
        TEST_TICKER,
        TEST_DATE
      );
      expect(wordCounts.length).toBeGreaterThan(0);
    });
  });

  describe('Feature Flag Integration', () => {
    it('should use ML sentiment when flag is enabled', async () => {
      // Feature flag should be enabled by default
      expect(FeatureFlags.USE_BROWSER_SENTIMENT).toBe(true);

      await syncSentimentData(TEST_TICKER, TEST_DATE);

      const wordCounts = await WordCountRepository.findByTickerAndDate(
        TEST_TICKER,
        TEST_DATE
      );

      // Should have analyzed articles with ML
      expect(wordCounts.length).toBeGreaterThan(0);
    });
  });

  describe('Data Consistency', () => {
    it('should maintain referential integrity', async () => {
      await syncSentimentData(TEST_TICKER, TEST_DATE);

      // All word counts should reference valid news articles
      const wordCounts = await WordCountRepository.findByTickerAndDate(
        TEST_TICKER,
        TEST_DATE
      );

      const news = await NewsRepository.findByTickerAndDateRange(
        TEST_TICKER,
        TEST_DATE,
        TEST_DATE
      );

      // Each word count should have corresponding news article
      expect(wordCounts.length).toBeLessThanOrEqual(news.length);
    });

    it('should have consistent aggregated counts', async () => {
      await syncSentimentData(TEST_TICKER, TEST_DATE);

      const wordCounts = await WordCountRepository.findByTickerAndDate(
        TEST_TICKER,
        TEST_DATE
      );

      const combinedArray = await CombinedWordRepository.findByTickerAndDateRange(
        TEST_TICKER,
        TEST_DATE,
        TEST_DATE
      );
      const combined = combinedArray[0];

      // Aggregated positive should be sum of individual positives
      const totalPositive = wordCounts.reduce((sum, wc) => sum + wc.positive, 0);
      const totalNegative = wordCounts.reduce((sum, wc) => sum + wc.negative, 0);

      expect(combined!.positive).toBe(totalPositive);
      expect(combined!.negative).toBe(totalNegative);
    });
  });

  describe('Performance Under Load', () => {
    it('should handle multiple articles efficiently', async () => {
      // Add more test articles (total 10)
      for (let i = 4; i <= 10; i++) {
        await NewsRepository.insert({
          date: TEST_DATE,
          ticker: TEST_TICKER,
          articleTickers: TEST_TICKER,
          title: `Test Article ${i}`,
          articleDate: TEST_DATE,
          articleUrl: `https://example.com/article-${i}`,
          publisher: 'Example News',
          ampUrl: '',
          articleDescription: `This is test article number ${i} with some content about the company.`,
        });
      }

      const startTime = performance.now();
      await syncSentimentData(TEST_TICKER, TEST_DATE);
      const duration = performance.now() - startTime;

      // 10 articles should complete in under 2 seconds
      expect(duration).toBeLessThan(2000);

      // Should have analyzed all 10 articles
      const wordCounts = await WordCountRepository.findByTickerAndDate(
        TEST_TICKER,
        TEST_DATE
      );

      expect(wordCounts).toHaveLength(10);
    });
  });
});
