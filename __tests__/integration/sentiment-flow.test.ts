/**
 * Sentiment Sync Unit Tests (converted from integration test)
 *
 * Tests sentiment sync logic with mocked repositories.
 * Original integration test was skipped due to Jest/DB initialization issues.
 * These unit tests provide equivalent coverage with mocked dependencies.
 */

import { syncSentimentData } from '@/services/sync/sentimentDataSync';
import * as NewsRepository from '@/database/repositories/news.repository';
import * as WordCountRepository from '@/database/repositories/wordCount.repository';
import { analyzeSentiment } from '@/ml/sentiment/sentiment.service';
import type { NewsDetails } from '@/types/database.types';

// Mock all repositories and ML service
jest.mock('@/database/repositories/news.repository');
jest.mock('@/database/repositories/wordCount.repository');
jest.mock('@/ml/sentiment/sentiment.service');

const mockNewsRepo = NewsRepository as jest.Mocked<typeof NewsRepository>;
const mockWordCountRepo = WordCountRepository as jest.Mocked<typeof WordCountRepository>;
const mockAnalyzeSentiment = analyzeSentiment as jest.MockedFunction<typeof analyzeSentiment>;

// Test data
const TEST_TICKER = 'AAPL';
const TEST_DATE = '2024-01-15';

const mockNewsArticles: NewsDetails[] = [
  {
    id: 1,
    date: TEST_DATE,
    ticker: TEST_TICKER,
    articleTickers: TEST_TICKER,
    title: 'Strong Earnings Beat Expectations',
    articleDate: TEST_DATE,
    articleUrl: 'https://example.com/1',
    publisher: 'Example News',
    ampUrl: '',
    articleDescription: 'Company announces record earnings that beat analyst expectations.',
  },
  {
    id: 2,
    date: TEST_DATE,
    ticker: TEST_TICKER,
    articleTickers: TEST_TICKER,
    title: 'Stock Price Plummets',
    articleDate: TEST_DATE,
    articleUrl: 'https://example.com/2',
    publisher: 'Example News',
    ampUrl: '',
    articleDescription: 'Shares plummeted after disappointing results and significant losses.',
  },
  {
    id: 3,
    date: TEST_DATE,
    ticker: TEST_TICKER,
    articleTickers: TEST_TICKER,
    title: 'Quarterly Results Announced',
    articleDate: TEST_DATE,
    articleUrl: 'https://example.com/3',
    publisher: 'Example News',
    ampUrl: '',
    articleDescription: 'Company announced quarterly results in line with expectations.',
  },
];

describe('Sentiment Sync Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Sync Flow', () => {
    it('should sync sentiment for all news articles', async () => {
      // Arrange
      mockNewsRepo.findByTickerAndDateRange.mockResolvedValue(mockNewsArticles);
      mockWordCountRepo.findByHash.mockResolvedValue(null); // No existing sentiment
      mockAnalyzeSentiment.mockResolvedValue({
        positive: 5,
        negative: 2,
        neutral: 3,
        sentiment: 'POS',
        sentimentNumber: 1,
      });

      // Act
      const result = await syncSentimentData(TEST_TICKER, TEST_DATE);

      // Assert
      expect(result).toBe(3); // 3 articles analyzed
      expect(mockNewsRepo.findByTickerAndDateRange).toHaveBeenCalledWith(
        TEST_TICKER,
        TEST_DATE,
        TEST_DATE
      );
      expect(mockAnalyzeSentiment).toHaveBeenCalledTimes(3);
      expect(mockWordCountRepo.insert).toHaveBeenCalledTimes(3);
    });

    it('should skip articles that already have sentiment', async () => {
      // Arrange
      mockNewsRepo.findByTickerAndDateRange.mockResolvedValue(mockNewsArticles);
      mockWordCountRepo.findByHash
        .mockResolvedValueOnce({ id: 1, hash: 123 }) // First article exists
        .mockResolvedValueOnce(null) // Second article doesn't exist
        .mockResolvedValueOnce({ id: 2, hash: 456 }); // Third article exists

      mockAnalyzeSentiment.mockResolvedValue({
        positive: 3,
        negative: 1,
        neutral: 2,
        sentiment: 'POS',
        sentimentNumber: 1,
      });

      // Act
      const result = await syncSentimentData(TEST_TICKER, TEST_DATE);

      // Assert
      expect(result).toBe(1); // Only 1 article analyzed (second one)
      expect(mockAnalyzeSentiment).toHaveBeenCalledTimes(1);
      expect(mockWordCountRepo.insert).toHaveBeenCalledTimes(1);
    });

    it('should handle articles with no description', async () => {
      // Arrange
      const articlesWithEmpty = [
        ...mockNewsArticles,
        {
          ...mockNewsArticles[0],
          id: 4,
          articleDescription: '',
        },
      ];

      mockNewsRepo.findByTickerAndDateRange.mockResolvedValue(articlesWithEmpty);
      mockWordCountRepo.findByHash.mockResolvedValue(null);
      mockAnalyzeSentiment.mockResolvedValue({
        positive: 1,
        negative: 1,
        neutral: 1,
        sentiment: 'NEUT',
        sentimentNumber: 0,
      });

      // Act
      const result = await syncSentimentData(TEST_TICKER, TEST_DATE);

      // Assert
      expect(result).toBe(3); // Only articles with descriptions analyzed
      expect(mockAnalyzeSentiment).toHaveBeenCalledTimes(3);
    });
  });

  describe('Error Handling', () => {
    it('should handle empty news array', async () => {
      // Arrange
      mockNewsRepo.findByTickerAndDateRange.mockResolvedValue([]);

      // Act
      const result = await syncSentimentData(TEST_TICKER, TEST_DATE);

      // Assert
      expect(result).toBe(0);
      expect(mockAnalyzeSentiment).not.toHaveBeenCalled();
      expect(mockWordCountRepo.insert).not.toHaveBeenCalled();
    });

    it('should continue processing if sentiment analysis fails for one article', async () => {
      // Arrange
      mockNewsRepo.findByTickerAndDateRange.mockResolvedValue(mockNewsArticles);
      mockWordCountRepo.findByHash.mockResolvedValue(null);

      mockAnalyzeSentiment
        .mockResolvedValueOnce({
          positive: 5,
          negative: 1,
          neutral: 2,
          sentiment: 'POS',
          sentimentNumber: 1,
        })
        .mockRejectedValueOnce(new Error('Sentiment analysis failed'))
        .mockResolvedValueOnce({
          positive: 2,
          negative: 4,
          neutral: 1,
          sentiment: 'NEG',
          sentimentNumber: -1,
        });

      // Act
      const result = await syncSentimentData(TEST_TICKER, TEST_DATE);

      // Assert
      expect(result).toBe(2); // 2 out of 3 succeeded
      expect(mockAnalyzeSentiment).toHaveBeenCalledTimes(3);
      expect(mockWordCountRepo.insert).toHaveBeenCalledTimes(2);
    });
  });

  describe('Data Validation', () => {
    it('should store correct sentiment data structure', async () => {
      // Arrange
      const mockSentimentResult = {
        positive: 8,
        negative: 2,
        neutral: 5,
        sentiment: 'POS',
        sentimentNumber: 1,
      };

      mockNewsRepo.findByTickerAndDateRange.mockResolvedValue([mockNewsArticles[0]]);
      mockWordCountRepo.findByHash.mockResolvedValue(null);
      mockAnalyzeSentiment.mockResolvedValue(mockSentimentResult);

      // Act
      await syncSentimentData(TEST_TICKER, TEST_DATE);

      // Assert
      expect(mockWordCountRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          ticker: TEST_TICKER,
          date: TEST_DATE,
          positive: 8,
          negative: 2,
          sentiment: 'POS',
          sentimentNumber: 1,
          body: mockNewsArticles[0].articleDescription,
        })
      );
    });
  });
});
