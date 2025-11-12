/**
 * End-to-End Offline Mode Tests
 *
 * Tests that critical functionality works offline:
 * - ML models (sentiment, predictions) work without network
 * - Database queries work offline
 * - Graceful degradation for API calls
 */

import * as StockRepository from '@/database/repositories/stock.repository';
import * as NewsRepository from '@/database/repositories/news.repository';
import * as PortfolioRepository from '@/database/repositories/portfolio.repository';
import { getSentimentAnalyzer } from '@/ml/sentiment/analyzer';
import { StandardScaler } from '@/ml/prediction/scaler';
import { buildFeatureMatrix } from '@/ml/prediction/preprocessing';

jest.mock('@/database');

describe('E2E: Offline Mode', () => {
  const TEST_TICKER = 'OFFLINE';

  describe('ML Models Work Offline', () => {
    it('should perform sentiment analysis offline', () => {
      // Sentiment analysis uses browser-based analyzer (no network needed)
      const analyzer = getSentimentAnalyzer();
      const positiveText = 'Excellent quarterly results exceeded expectations with strong revenue growth';
      const negativeText = 'Disappointing earnings miss and significant losses reported';
      const neutralText = 'Company announced quarterly results today';

      const positive = analyzer.analyze(positiveText, 'positive-hash');
      // SentimentResult has: positive: [count, confidence], negative: [count, confidence]
      expect(positive).toBeDefined();
      expect(positive.positive).toBeDefined();
      expect(positive.positive[0]).toBeDefined(); // count
      expect(positive.positive[1]).toBeDefined(); // confidence

      const negative = analyzer.analyze(negativeText, 'negative-hash');
      expect(negative).toBeDefined();
      expect(negative.negative).toBeDefined();
      expect(negative.negative[0]).toBeDefined(); // count
      expect(negative.negative[1]).toBeDefined(); // confidence

      const neutral = analyzer.analyze(neutralText, 'neutral-hash');
      expect(neutral).toBeDefined();
      expect(neutral.neutral).toBeDefined();

      // All work without network
      expect(positive.hash).toBe('positive-hash');
      expect(negative.hash).toBe('negative-hash');
      expect(neutral.hash).toBe('neutral-hash');
    });

    it('should perform prediction preprocessing offline', () => {
      // Prediction model preprocessing works offline
      const mockFeatures = {
        sentiment_positive: 0.8,
        sentiment_negative: 0.2,
        sentiment_score: 0.6,
        price_change_pct: 2.5,
        volume_change_pct: 15.0,
        volatility: 0.02,
      };

      const scaler = new StandardScaler();
      const dataMatrix = [
        [0.8, 0.2, 0.6, 2.5, 15.0, 0.02],
        [0.6, 0.3, 0.3, 1.0, 10.0, 0.03],
        [0.7, 0.2, 0.5, 2.0, 12.0, 0.025],
      ];

      scaler.fit(dataMatrix);
      const scaled = scaler.transform([[0.8, 0.2, 0.6, 2.5, 15.0, 0.02]]);

      expect(scaled).toBeDefined();
      expect(scaled).toHaveLength(1);
      expect(scaled[0]).toHaveLength(6);
    });

    it('should perform feature engineering offline', () => {
      // Feature preprocessing works without network
      const mockInput = {
        stockData: [
          {
            ticker: TEST_TICKER,
            date: '2024-01-01',
            close: 100,
            volume: 1000000,
            open: 99,
            high: 101,
            low: 98,
          },
          {
            ticker: TEST_TICKER,
            date: '2024-01-02',
            close: 102,
            volume: 1100000,
            open: 100,
            high: 103,
            low: 99,
          },
        ],
        sentimentData: [
          {
            ticker: TEST_TICKER,
            date: '2024-01-01',
            positiveScore: 0.7,
            negativeScore: 0.3,
            positive: 5,
            negative: 2,
          },
          {
            ticker: TEST_TICKER,
            date: '2024-01-02',
            positiveScore: 0.8,
            negativeScore: 0.2,
            positive: 6,
            negative: 1,
          },
        ],
      };

      // This should work offline (pure computation)
      const features = buildFeatureMatrix(mockInput as any);
      expect(features).toBeDefined();
      expect(Array.isArray(features)).toBe(true);
    });
  });

  describe('Database Operations Work Offline', () => {
    it('should query portfolio offline', async () => {
      // Add items to portfolio
      await PortfolioRepository.insert({
        ticker: 'AAPL',
        name: 'Apple Inc.',
        addedAt: new Date().toISOString(),
      });

      await PortfolioRepository.insert({
        ticker: 'GOOGL',
        name: 'Alphabet Inc.',
        addedAt: new Date().toISOString(),
      });

      // Query works offline (local database)
      const portfolio = await PortfolioRepository.findAll();
      expect(portfolio.length).toBeGreaterThanOrEqual(2);

      // Cleanup
      await PortfolioRepository.deleteByTicker('AAPL');
      await PortfolioRepository.deleteByTicker('GOOGL');
    });

    it('should query cached stock data offline', async () => {
      // Add stock data
      const stockData = {
        ticker: TEST_TICKER,
        date: '2024-01-15',
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
      };

      await StockRepository.insert(stockData);

      // Query works offline
      const data = await StockRepository.findByTicker(TEST_TICKER);
      expect(data).toHaveLength(1);
      expect(data[0].close).toBe(102);

      await StockRepository.deleteByTicker(TEST_TICKER);
    });

    it('should query cached news offline', async () => {
      const newsData = {
        ticker: TEST_TICKER,
        date: '2024-01-15',
        articleDate: '2024-01-15',
        articleUrl: 'https://example.com/article',
        articleTickers: TEST_TICKER,
        title: 'Offline Test Article',
        publisher: 'Test Publisher',
        ampUrl: '',
        articleDescription: 'This article can be read offline from cache',
      };

      await NewsRepository.insert(newsData);

      // Query works offline
      const news = await NewsRepository.findByTicker(TEST_TICKER);
      expect(news).toHaveLength(1);
      expect(news[0].title).toBe('Offline Test Article');

      await NewsRepository.deleteByTicker(TEST_TICKER);
    });
  });

  describe('Graceful Degradation', () => {
    it('should show cached data when network unavailable', async () => {
      // Simulate offline scenario: database has data, but network calls would fail
      const cachedStock = {
        ticker: 'CACHED',
        date: '2024-01-10',
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
      };

      await StockRepository.insert(cachedStock);

      // User can still access cached data
      const data = await StockRepository.findByTicker('CACHED');
      expect(data).toHaveLength(1);

      // User can perform offline analysis on cached data
      const analyzer = getSentimentAnalyzer();
      const sentiment = analyzer.analyze(
        'Cached article about great company performance',
        'cached-hash'
      );
      expect(sentiment).toBeDefined();

      await StockRepository.deleteByTicker('CACHED');
    });

    it('should handle offline portfolio management', async () => {
      // User can add/remove from portfolio offline
      await PortfolioRepository.insert({
        ticker: 'OFFLINE1',
        name: 'Offline Stock 1',
        addedAt: new Date().toISOString(),
      });

      let portfolio = await PortfolioRepository.findAll();
      const initialCount = portfolio.length;

      await PortfolioRepository.insert({
        ticker: 'OFFLINE2',
        name: 'Offline Stock 2',
        addedAt: new Date().toISOString(),
      });

      portfolio = await PortfolioRepository.findAll();
      expect(portfolio.length).toBe(initialCount + 1);

      await PortfolioRepository.deleteByTicker('OFFLINE1');
      await PortfolioRepository.deleteByTicker('OFFLINE2');
    });
  });

  describe('Offline Performance', () => {
    it('should perform sentiment analysis quickly offline', () => {
      const analyzer = getSentimentAnalyzer();
      const article = 'Company reports excellent quarterly earnings with strong revenue growth';

      const startTime = Date.now();
      const result = analyzer.analyze(article, 'perf-hash');
      const duration = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(100); // Should be < 100ms offline
    });

    it('should scale features quickly offline', () => {
      const scaler = new StandardScaler();
      const data = Array(100)
        .fill(0)
        .map(() => [Math.random(), Math.random(), Math.random()]);

      const startTime = Date.now();
      scaler.fit(data);
      const scaled = scaler.transform(data);
      const duration = Date.now() - startTime;

      expect(scaled).toBeDefined();
      expect(duration).toBeLessThan(50); // Should be very fast
    });

    it('should query database quickly offline', async () => {
      // Add test data
      for (let i = 1; i <= 30; i++) {
        await StockRepository.insert({
          ticker: 'PERFTEST',
          date: `2024-01-${String(i).padStart(2, '0')}`,
          open: 100 + i,
          high: 105 + i,
          low: 95 + i,
          close: 102 + i,
          volume: 1000000,
          adjClose: 102 + i,
          adjHigh: 105 + i,
          adjLow: 95 + i,
          adjOpen: 100 + i,
          adjVolume: 1000000,
          divCash: 0,
          splitFactor: 1,
        });
      }

      const startTime = Date.now();
      const data = await StockRepository.findByTicker('PERFTEST');
      const duration = Date.now() - startTime;

      expect(data).toHaveLength(30);
      expect(duration).toBeLessThan(100); // Database query should be fast

      await StockRepository.deleteByTicker('PERFTEST');
    });
  });

  describe('Data Integrity Offline', () => {
    it('should maintain data consistency without network', async () => {
      const ticker = 'INTEGRITY';

      // Perform multiple operations offline
      await PortfolioRepository.insert({
        ticker,
        name: 'Integrity Test',
        addedAt: new Date().toISOString(),
      });

      await StockRepository.insert({
        ticker,
        date: '2024-01-15',
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

      // Verify both operations succeeded
      const portfolio = await PortfolioRepository.findByTicker(ticker);
      const stock = await StockRepository.findByTicker(ticker);

      expect(portfolio).toBeTruthy();
      expect(stock).toHaveLength(1);

      // Cleanup
      await PortfolioRepository.deleteByTicker(ticker);
      await StockRepository.deleteByTicker(ticker);
    });
  });
});
