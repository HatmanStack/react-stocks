import { updatePredictions } from '@/services/sync/sentimentDataSync';
import * as CombinedWordRepository from '@/database/repositories/combinedWord.repository';
import * as PortfolioRepository from '@/database/repositories/portfolio.repository';
import type { CombinedWordDetails } from '@/types/database.types';

// Mock repositories
jest.mock('@/database/repositories/combinedWord.repository');
jest.mock('@/database/repositories/portfolio.repository');
jest.mock('@/database/repositories/wordCount.repository');

// Mock dependencies
jest.mock('@/ml/sentiment/sentiment.service');
jest.mock('@/utils/sentiment/wordCounter');
jest.mock('@/utils/sentiment/sentimentCalculator');
jest.mock('@/services/api/finnhub.service');
jest.mock('@/config/features');

describe('SentimentDataSync', () => {
  describe('updatePredictions', () => {
    const mockPredictions = {
      nextDay: { direction: 'up' as const, probability: 0.75 },
      twoWeek: { direction: 'up' as const, probability: 0.65 },
      oneMonth: { direction: 'down' as const, probability: 0.55 },
    };

    const ticker = 'AAPL';
    const today = new Date().toISOString().split('T')[0];

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should update combined word details with predictions', async () => {
      // Mock findByTickerAndDateRange to return a record
      const mockRecord: CombinedWordDetails = {
        ticker,
        date: today,
        positive: 10,
        negative: 5,
        sentimentNumber: 0.5,
        sentiment: 'POS',
        nextDay: 0,
        twoWks: 0,
        oneMnth: 0,
        updateDate: '2025-01-01T00:00:00.000Z',
      };

      (CombinedWordRepository.findByTickerAndDateRange as jest.Mock).mockResolvedValue([mockRecord]);
      (PortfolioRepository.findByTicker as jest.Mock).mockResolvedValue(null); // No portfolio item

      await updatePredictions(ticker, mockPredictions);

      expect(CombinedWordRepository.upsert).toHaveBeenCalledWith(expect.objectContaining({
        ticker,
        date: today,
        nextDayDirection: 'up',
        nextDayProbability: 0.75,
        twoWeekDirection: 'up',
        twoWeekProbability: 0.65,
        oneMonthDirection: 'down',
        oneMonthProbability: 0.55,
      }));
    });

    it('should update portfolio item if exists', async () => {
      (CombinedWordRepository.findByTickerAndDateRange as jest.Mock).mockResolvedValue([]);
      (PortfolioRepository.findByTicker as jest.Mock).mockResolvedValue({ ticker }); // Exists

      await updatePredictions(ticker, mockPredictions);

      expect(PortfolioRepository.update).toHaveBeenCalledWith(ticker, expect.objectContaining({
        nextDayDirection: 'up',
        nextDayProbability: 0.75,
      }));
    });

    it('should handle errors gracefully', async () => {
      (CombinedWordRepository.findByTickerAndDateRange as jest.Mock).mockRejectedValue(new Error('DB Error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await updatePredictions(ticker, mockPredictions);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to update predictions'), expect.any(Error));
      consoleSpy.mockRestore();
    });
  });
});
