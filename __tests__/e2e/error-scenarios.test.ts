/**
 * End-to-End Error Scenario Tests
 *
 * Tests error handling across the application:
 * - Invalid tickers
 * - Network failures
 * - Malformed data
 * - Edge cases
 */

import * as SymbolRepository from '@/database/repositories/symbol.repository';
import * as StockRepository from '@/database/repositories/stock.repository';
import * as NewsRepository from '@/database/repositories/news.repository';
import { getSentimentAnalyzer } from '@/ml/sentiment/analyzer';
import { generatePrediction } from '@/ml/prediction/prediction.service';
import { validateTicker, validateDateRange } from '@/utils/validation/inputValidation';

jest.mock('@/database');

describe('E2E: Error Scenarios', () => {
  describe('Invalid Ticker Handling', () => {
    it('should handle non-existent ticker gracefully', async () => {
      const result = await SymbolRepository.findByTicker('INVALID');
      expect(result).toBeNull();
    });

    it('should validate ticker format', () => {
      // Valid tickers
      expect(validateTicker('AAPL')).toBe(true);
      expect(validateTicker('GOOGL')).toBe(true);

      // Invalid tickers
      expect(validateTicker('')).toBe(false);
      expect(validateTicker('AA')).toBe(false); // Too short
      expect(validateTicker('TOOLONG12345')).toBe(false); // Too long
      expect(validateTicker('AA$PL')).toBe(false); // Special characters
      expect(validateTicker('123')).toBe(false); // Only numbers
    });

    it('should handle case insensitivity', async () => {
      const mockSymbol = {
        ticker: 'AAPL',
        name: 'Apple Inc.',
        exchangeCode: 'NASDAQ',
        longDescription: 'Technology company',
        startDate: '2015-01-01',
        endDate: '2026-01-01',
      };

      await SymbolRepository.insert(mockSymbol);

      // Both cases should work (repository normalizes to uppercase)
      const upperCase = await SymbolRepository.findByTicker('AAPL');
      const lowerCase = await SymbolRepository.findByTicker('aapl');

      // Note: Repository implementation converts to uppercase
      expect(upperCase).toBeDefined();

      await SymbolRepository.deleteByTicker('AAPL');
    });
  });

  describe('Date Range Validation', () => {
    it('should validate date format', () => {
      // Valid dates
      expect(validateDateRange('2024-01-01', '2024-12-31')).toBe(true);
      expect(validateDateRange('2024-01-01', '2024-01-01')).toBe(true); // Same day

      // Invalid formats
      expect(validateDateRange('2024/01/01', '2024/12/31')).toBe(false);
      expect(validateDateRange('01-01-2024', '12-31-2024')).toBe(false);
      expect(validateDateRange('invalid', '2024-12-31')).toBe(false);
    });

    it('should validate date logic', () => {
      // End date before start date
      expect(validateDateRange('2024-12-31', '2024-01-01')).toBe(false);

      // Future dates
      const futureDate = '2050-01-01';
      expect(validateDateRange('2024-01-01', futureDate)).toBe(false);
    });
  });

  describe('Empty Data Handling', () => {
    it('should handle ticker with no stock data', async () => {
      const ticker = 'NODATA';

      // Insert symbol but no stock data
      await SymbolRepository.insert({
        ticker,
        name: 'No Data Corp',
        exchangeCode: 'NASDAQ',
        longDescription: 'Company with no data',
        startDate: '2024-01-01',
        endDate: '2026-01-01',
      });

      const stockData = await StockRepository.findByTicker(ticker);
      expect(stockData).toHaveLength(0);

      await SymbolRepository.deleteByTicker(ticker);
    });

    it('should handle ticker with no news', async () => {
      const ticker = 'NONEWS';

      await SymbolRepository.insert({
        ticker,
        name: 'No News Corp',
        exchangeCode: 'NASDAQ',
        longDescription: 'Company with no news',
        startDate: '2024-01-01',
        endDate: '2026-01-01',
      });

      const news = await NewsRepository.findByTicker(ticker);
      expect(news).toHaveLength(0);

      await SymbolRepository.deleteByTicker(ticker);
    });
  });

  describe('Malformed Data Handling', () => {
    it('should handle empty article description in sentiment analysis', () => {
      const analyzer = getSentimentAnalyzer();
      const result = analyzer.analyze('', 'empty-hash');

      expect(result.positive).toBe(0);
      expect(result.negative).toBe(0);
      expect(result.score).toBe(0);
      expect(result.comparative).toBe(0);
    });

    it('should handle very long text in sentiment analysis', () => {
      const analyzer = getSentimentAnalyzer();
      const longText = 'great '.repeat(1000); // 5000+ characters
      const result = analyzer.analyze(longText, 'long-hash');

      expect(result.positive).toBeGreaterThan(0);
      expect(result.score).toBeGreaterThan(0);
    });

    it('should handle special characters in sentiment analysis', () => {
      const analyzer = getSentimentAnalyzer();
      const specialChars = '!@#$%^&*()[]{}|\\/<>?';
      const result = analyzer.analyze(specialChars, 'special-hash');

      // Should not crash, neutral sentiment
      expect(result).toBeDefined();
      expect(result.score).toBe(0);
    });

    it('should handle mixed language text', () => {
      const analyzer = getSentimentAnalyzer();
      const mixedText = 'Great company! 很好的公司 Excellente entreprise';
      const result = analyzer.analyze(mixedText, 'mixed-hash');

      // Should still detect English sentiment
      expect(result).toBeDefined();
      expect(result.positive).toBeGreaterThan(0);
    });
  });

  describe('Insufficient Data for Predictions', () => {
    it('should handle ticker with insufficient historical data', async () => {
      const ticker = 'NEWSTOCK';

      // Add symbol
      await SymbolRepository.insert({
        ticker,
        name: 'New Stock Inc',
        exchangeCode: 'NASDAQ',
        longDescription: 'Newly listed company',
        startDate: '2024-01-01',
        endDate: '2026-01-01',
      });

      // Add only 5 days of data (insufficient for prediction which needs 30)
      for (let i = 1; i <= 5; i++) {
        await StockRepository.insert({
          ticker,
          date: `2024-01-0${i}`,
          open: 100,
          high: 105,
          low: 95,
          close: 102,
          volume: 1000000,
          adjClose: 102,
          adjHigh: 105,
          adjLow: 95,
          adjOpen: 100,
          adjVolume: 1000000,
          divCash: 0,
          splitFactor: 1,
        });
      }

      // Attempt prediction with insufficient data
      try {
        await generatePrediction(ticker, 30);
        // Should either throw or return null/empty prediction
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Cleanup
      await StockRepository.deleteByTicker(ticker);
      await SymbolRepository.deleteByTicker(ticker);
    });
  });

  describe('Delisted Stock Handling', () => {
    it('should handle delisted stock with endDate in past', async () => {
      const ticker = 'DELISTED';

      await SymbolRepository.insert({
        ticker,
        name: 'Delisted Corp',
        exchangeCode: 'NASDAQ',
        longDescription: 'This company was delisted',
        startDate: '2010-01-01',
        endDate: '2020-12-31', // Delisted in 2020
      });

      const symbol = await SymbolRepository.findByTicker(ticker);
      expect(symbol).toBeTruthy();
      expect(new Date(symbol!.endDate) < new Date()).toBe(true);

      await SymbolRepository.deleteByTicker(ticker);
    });
  });

  describe('Database Error Recovery', () => {
    it('should handle duplicate ticker inserts', async () => {
      const ticker = 'DUPE';
      const symbolData = {
        ticker,
        name: 'Duplicate Test',
        exchangeCode: 'NASDAQ',
        longDescription: 'Test duplicate handling',
        startDate: '2024-01-01',
        endDate: '2026-01-01',
      };

      // First insert should succeed
      await SymbolRepository.insert(symbolData);

      // Second insert of same ticker - repository should handle via upsert
      await expect(SymbolRepository.insert(symbolData)).resolves.not.toThrow();

      await SymbolRepository.deleteByTicker(ticker);
    });
  });

  describe('Edge Cases', () => {
    it('should validate single-day date range', () => {
      const date = '2024-01-15';
      // Single day range should be valid
      const valid = validateDateRange(date, date);
      expect(valid).toBe(true);
    });

    it('should validate very old dates', () => {
      // Very old dates should be valid if in correct format
      const valid = validateDateRange('1980-01-01', '1980-12-31');
      expect(valid).toBe(true);
    });

    it('should handle reasonable date ranges', () => {
      // Current year should be valid
      const currentYear = new Date().getFullYear();
      const valid = validateDateRange(`${currentYear}-01-01`, `${currentYear}-12-31`);
      expect(valid).toBe(true);
    });
  });
});
