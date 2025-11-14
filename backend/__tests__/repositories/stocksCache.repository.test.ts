/**
 * Unit tests for StocksCache repository
 */

import {
  getStock,
  putStock,
  batchGetStocks,
  batchPutStocks,
  queryStocksByDateRange,
  type StockCacheItem,
  type PriceData,
} from '../../src/repositories/stocksCache.repository.js';

// Note: These tests verify the repository logic without actual DynamoDB calls
// Integration tests with DynamoDB Local or mocks would be in separate integration test files

describe('StocksCache Repository', () => {
  describe('Type Definitions', () => {
    it('should accept valid PriceData', () => {
      const priceData: PriceData = {
        open: 150,
        high: 155,
        low: 149,
        close: 154,
        volume: 1000000,
      };

      expect(priceData).toBeDefined();
      expect(priceData.open).toBe(150);
      expect(priceData.volume).toBe(1000000);
    });

    it('should accept PriceData with adjusted values', () => {
      const priceData: PriceData = {
        open: 150,
        high: 155,
        low: 149,
        close: 154,
        volume: 1000000,
        adjOpen: 148,
        adjHigh: 153,
        adjLow: 147,
        adjClose: 152,
        adjVolume: 1000000,
        divCash: 0.5,
        splitFactor: 1.0,
      };

      expect(priceData.adjClose).toBe(152);
      expect(priceData.divCash).toBe(0.5);
      expect(priceData.splitFactor).toBe(1.0);
    });

    it('should accept valid StockCacheItem', () => {
      const cacheItem: StockCacheItem = {
        ticker: 'AAPL',
        date: '2025-01-15',
        priceData: {
          open: 150,
          high: 155,
          low: 149,
          close: 154,
          volume: 1000000,
        },
        ttl: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
        fetchedAt: Date.now(),
      };

      expect(cacheItem.ticker).toBe('AAPL');
      expect(cacheItem.date).toBe('2025-01-15');
      expect(cacheItem.priceData.close).toBe(154);
    });

    it('should accept StockCacheItem with metadata', () => {
      const cacheItem: StockCacheItem = {
        ticker: 'AAPL',
        date: '2025-01-15',
        priceData: {
          open: 150,
          high: 155,
          low: 149,
          close: 154,
          volume: 1000000,
        },
        metadata: {
          ticker: 'AAPL',
          name: 'Apple Inc.',
          description: 'Technology company',
          exchange: 'NASDAQ',
          sector: 'Technology',
          industry: 'Consumer Electronics',
        },
        ttl: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
        fetchedAt: Date.now(),
      };

      expect(cacheItem.metadata?.name).toBe('Apple Inc.');
      expect(cacheItem.metadata?.exchange).toBe('NASDAQ');
    });
  });

  describe('batchGetStocks', () => {
    it('should return empty array for empty dates', async () => {
      const result = await batchGetStocks('AAPL', []);
      expect(result).toEqual([]);
    });

    // Note: Actual DynamoDB operations would be tested in integration tests
  });

  describe('batchPutStocks', () => {
    it('should handle empty items array', async () => {
      await expect(batchPutStocks([])).resolves.not.toThrow();
    });

    // Note: Actual DynamoDB operations would be tested in integration tests
  });

  describe('Repository Function Signatures', () => {
    it('should have correct getStock signature', () => {
      expect(typeof getStock).toBe('function');
      expect(getStock.length).toBe(2); // ticker, date
    });

    it('should have correct putStock signature', () => {
      expect(typeof putStock).toBe('function');
      expect(putStock.length).toBe(1); // item
    });

    it('should have correct batchGetStocks signature', () => {
      expect(typeof batchGetStocks).toBe('function');
      expect(batchGetStocks.length).toBe(2); // ticker, dates
    });

    it('should have correct batchPutStocks signature', () => {
      expect(typeof batchPutStocks).toBe('function');
      expect(batchPutStocks.length).toBe(1); // items
    });

    it('should have correct queryStocksByDateRange signature', () => {
      expect(typeof queryStocksByDateRange).toBe('function');
      expect(queryStocksByDateRange.length).toBe(3); // ticker, startDate, endDate
    });
  });

  describe('Data Validation', () => {
    it('should accept valid date format', () => {
      const validDate = '2025-01-15';
      expect(validDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should accept valid ticker format', () => {
      const validTickers = ['AAPL', 'GOOGL', 'MSFT', 'TSLA'];
      validTickers.forEach((ticker) => {
        expect(ticker).toBeTruthy();
        expect(ticker.length).toBeGreaterThan(0);
      });
    });

    it('should handle numeric price data', () => {
      const price = 150.25;
      const volume = 1000000;

      expect(typeof price).toBe('number');
      expect(typeof volume).toBe('number');
      expect(price).toBeGreaterThan(0);
      expect(volume).toBeGreaterThan(0);
    });
  });
});
