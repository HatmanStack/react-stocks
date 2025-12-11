import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { StockHistoricalDataItem, ArticleAnalysisDataItem } from '../../../backend/src/types/dynamodb.types';

// 1. Hoist mocks
const mockQueryStock = jest.fn();
const mockQueryArticles = jest.fn();
const mockPutStock = jest.fn();
const mockGetStock = jest.fn();
const mockPutArticle = jest.fn();
const mockPutDaily = jest.fn();
const mockGetDaily = jest.fn();

// 2. Define the mock implementation with ES modules support
jest.unstable_mockModule('../../../backend/src/services/dynamodb.client', () => {
  return {
    DynamoDBClientWrapper: jest.fn().mockImplementation(() => {
      return {
        queryStockDataByDateRange: mockQueryStock,
        queryArticlesByTicker: mockQueryArticles,
        putStockData: mockPutStock,
        getStockData: mockGetStock,
        putArticleAnalysis: mockPutArticle,
        putDailySentiment: mockPutDaily,
        getDailySentiment: mockGetDaily
      };
    })
  };
});

// 3. Dynamic import to load module under test AFTER mocks
const { fetchPriceData, fetchSentimentData, fetchHistoricalData } = await import('../../../backend/src/services/dataFetcher');
const { DynamoDBClientWrapper } = await import('../../../backend/src/services/dynamodb.client');

describe('DataFetcher Service', () => {
  const mockTicker = 'AAPL';
  const mockStartDate = '2023-01-01';
  const mockEndDate = '2023-01-31';

  beforeEach(() => {
    // Clear only method mocks, not the constructor mock
    mockQueryStock.mockClear();
    mockQueryArticles.mockClear();
    mockPutStock.mockClear();
    mockGetStock.mockClear();
    mockPutArticle.mockClear();
    mockPutDaily.mockClear();
    mockGetDaily.mockClear();
  });

  // The constructor is called when dataFetcher.ts is imported.
  // Since we dynamic import in the test file, it should have been called.
  it('should have instantiated DynamoDBClientWrapper', () => {
     expect(DynamoDBClientWrapper).toHaveBeenCalled();
  });

  describe('fetchPriceData', () => {
    it('should fetch and map price data correctly', async () => {
      const mockItems: StockHistoricalDataItem[] = [
        {
          ticker: mockTicker,
          date: '2023-01-02',
          open: 150,
          high: 155,
          low: 149,
          close: 153,
          volume: 1000000
        },
        {
          ticker: mockTicker,
          date: '2023-01-01',
          open: 148,
          high: 152,
          low: 147,
          close: 150,
          volume: 900000
        }
      ];

      // Cast to any to avoid TS inference issues with jest.fn() generic defaults
      (mockQueryStock as any).mockResolvedValue(mockItems);

      const result = await fetchPriceData(mockTicker, mockStartDate, mockEndDate);

      expect(mockQueryStock).toHaveBeenCalledWith(
        mockTicker,
        mockStartDate,
        mockEndDate
      );

      expect(result).toHaveLength(2);
      expect(result[0].date).toBe('2023-01-01');
      expect(result[1].date).toBe('2023-01-02');
      expect(result[0].close).toBe(150);
    });

    it('should throw error on failure', async () => {
      (mockQueryStock as any).mockRejectedValue(new Error('DB Error'));

      await expect(fetchPriceData(mockTicker, mockStartDate, mockEndDate)).rejects.toThrow('DB Error');
    });
  });

  describe('fetchSentimentData', () => {
    it('should fetch and map sentiment data correctly', async () => {
      const mockItems: ArticleAnalysisDataItem[] = [
        {
          ticker: mockTicker,
          'articleHash#date': 'hash1#2023-01-01',
          articleHash: 'hash1',
          date: '2023-01-01',
          eventType: 'EARNINGS',
          aspectScore: 0.8,
          mlScore: 0.9,
          materialityScore: 1.0
        }
      ];

      (mockQueryArticles as any).mockResolvedValue(mockItems);

      const result = await fetchSentimentData(mockTicker, mockStartDate, mockEndDate);

      expect(mockQueryArticles).toHaveBeenCalledWith(
        mockTicker,
        mockStartDate,
        mockEndDate
      );

      expect(result).toHaveLength(1);
      expect(result[0].hash).toBe('hash1');
      expect(result[0].eventType).toBe('EARNINGS');
      expect(result[0].aspectScore).toBe(0.8);
    });
  });

  describe('fetchHistoricalData', () => {
    it('should throw error if days < 30', async () => {
      await expect(fetchHistoricalData(mockTicker, 29)).rejects.toThrow('Insufficient data requested');
    });

    it('should fetch both price and sentiment data and return aggregate', async () => {
        const mockPriceItems = Array(30).fill(null).map((_, i) => ({
            ticker: mockTicker,
            date: `2023-01-${String(i + 1).padStart(2, '0')}`,
            open: 100, high: 100, low: 100, close: 100, volume: 100
        }));

        (mockQueryStock as any).mockResolvedValue(mockPriceItems);
        (mockQueryArticles as any).mockResolvedValue([]);

        const result = await fetchHistoricalData(mockTicker, 30);

        expect(result.ticker).toBe(mockTicker);
        expect(result.prices).toHaveLength(30);
        expect(result.sentiment).toHaveLength(0);
    });

    it('should throw error if insufficient price data found', async () => {
         (mockQueryStock as any).mockResolvedValue([]);
         (mockQueryArticles as any).mockResolvedValue([]);

         await expect(fetchHistoricalData(mockTicker, 30)).rejects.toThrow('Insufficient price data');
    });
  });
});
