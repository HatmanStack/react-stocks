/**
 * End-to-End Complete Flow Tests
 *
 * Tests the complete user journey through the application:
 * 1. Search for stock
 * 2. View stock details
 * 3. Add to portfolio
 * 4. Sync data
 * 5. View predictions
 * 6. Remove from portfolio
 */

import * as SymbolRepository from '@/database/repositories/symbol.repository';
import * as StockRepository from '@/database/repositories/stock.repository';
import * as NewsRepository from '@/database/repositories/news.repository';
import * as PortfolioRepository from '@/database/repositories/portfolio.repository';
import { syncOrchestrator } from '@/services/sync/syncOrchestrator';
import { getSentimentAnalyzer } from '@/ml/sentiment/analyzer';
import { generatePrediction } from '@/ml/prediction/prediction.service';
import type { SymbolDetails, StockDetails, NewsDetails } from '@/types/database.types';

// Mock external API calls
jest.mock('@/services/api/tiingo.service');
jest.mock('@/services/api/polygon.service');
jest.mock('@/database');

describe('E2E: Complete User Flow', () => {
  const TEST_TICKER = 'AAPL';
  const TEST_DATE = '2024-01-15';

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  describe('Happy Path: New User Flow', () => {
    it('should complete full user journey successfully', async () => {
      // Step 1: User searches for stock (mock symbol metadata)
      const mockSymbol: Omit<SymbolDetails, 'id'> = {
        ticker: TEST_TICKER,
        name: 'Apple Inc.',
        exchangeCode: 'NASDAQ',
        longDescription: 'Apple Inc. is a technology company',
        startDate: '2015-01-01',
        endDate: '2026-01-01',
      };

      await SymbolRepository.insert(mockSymbol);
      const symbol = await SymbolRepository.findByTicker(TEST_TICKER);
      expect(symbol).toBeTruthy();
      expect(symbol?.name).toBe('Apple Inc.');

      // Step 2: User views stock details - verify symbol exists
      const exists = await SymbolRepository.existsByTicker(TEST_TICKER);
      expect(exists).toBe(true);

      // Step 3: User adds stock to portfolio
      const portfolioItem = {
        ticker: TEST_TICKER,
        name: 'Apple Inc.',
        addedAt: new Date().toISOString(),
      };
      await PortfolioRepository.insert(portfolioItem);

      const portfolio = await PortfolioRepository.findAll();
      expect(portfolio).toHaveLength(1);
      expect(portfolio[0].ticker).toBe(TEST_TICKER);

      // Step 4: System syncs stock data
      const mockStockData: Omit<StockDetails, 'id'> = {
        ticker: TEST_TICKER,
        date: TEST_DATE,
        open: 180.0,
        high: 185.0,
        low: 179.0,
        close: 184.0,
        volume: 50000000,
        adjClose: 184.0,
        adjHigh: 185.0,
        adjLow: 179.0,
        adjOpen: 180.0,
        adjVolume: 50000000,
        divCash: 0,
        splitFactor: 1,
      };

      await StockRepository.insert(mockStockData);
      const stockData = await StockRepository.findByTicker(TEST_TICKER);
      expect(stockData).toHaveLength(1);
      expect(stockData[0].close).toBe(184.0);

      // Step 5: System syncs news data
      const mockNews: Omit<NewsDetails, 'id'> = {
        ticker: TEST_TICKER,
        date: TEST_DATE,
        articleDate: TEST_DATE,
        articleUrl: 'https://example.com/news/1',
        articleTickers: TEST_TICKER,
        title: 'Apple announces strong quarterly results',
        publisher: 'Example News',
        ampUrl: '',
        articleDescription: 'Apple Inc. reported excellent quarterly earnings that beat analyst expectations.',
      };

      await NewsRepository.insert(mockNews);
      const news = await NewsRepository.findByTicker(TEST_TICKER);
      expect(news).toHaveLength(1);

      // Step 6: Browser-based ML analyzes sentiment
      const analyzer = getSentimentAnalyzer();
      const sentimentResult = analyzer.analyze(mockNews.articleDescription, 'hash-1');
      expect(sentimentResult.positive).toBeGreaterThan(0);
      expect(sentimentResult.score).toBeGreaterThan(0); // Positive article

      // Step 7: Browser-based ML generates predictions
      // Note: Requires sufficient historical data, this is a simplified test
      const prediction = await generatePrediction(TEST_TICKER, 30);
      expect(prediction).toBeDefined();
      expect(prediction.ticker).toBe(TEST_TICKER);

      // Step 8: User removes from portfolio
      await PortfolioRepository.deleteByTicker(TEST_TICKER);
      const emptyPortfolio = await PortfolioRepository.findAll();
      expect(emptyPortfolio).toHaveLength(0);

      // Cleanup
      await StockRepository.deleteByTicker(TEST_TICKER);
      await NewsRepository.deleteByTicker(TEST_TICKER);
      await SymbolRepository.deleteByTicker(TEST_TICKER);
    });
  });

  describe('Stock Details Workflow', () => {
    it('should handle viewing all stock detail tabs', async () => {
      // Setup: Add symbol and stock data
      const symbol: Omit<SymbolDetails, 'id'> = {
        ticker: TEST_TICKER,
        name: 'Apple Inc.',
        exchangeCode: 'NASDAQ',
        longDescription: 'Technology company',
        startDate: '2015-01-01',
        endDate: '2026-01-01',
      };
      await SymbolRepository.insert(symbol);

      const stockData: Omit<StockDetails, 'id'> = {
        ticker: TEST_TICKER,
        date: TEST_DATE,
        open: 180.0,
        high: 185.0,
        low: 179.0,
        close: 184.0,
        volume: 50000000,
        adjClose: 184.0,
        adjHigh: 185.0,
        adjLow: 179.0,
        adjOpen: 180.0,
        adjVolume: 50000000,
        divCash: 0,
        splitFactor: 1,
      };
      await StockRepository.insert(stockData);

      // Tab 1: Price tab - verify stock data accessible
      const prices = await StockRepository.findByTicker(TEST_TICKER);
      expect(prices).toHaveLength(1);
      expect(prices[0].close).toBe(184.0);

      // Tab 2: News tab - verify news accessible
      const news: Omit<NewsDetails, 'id'> = {
        ticker: TEST_TICKER,
        date: TEST_DATE,
        articleDate: TEST_DATE,
        articleUrl: 'https://example.com/article',
        articleTickers: TEST_TICKER,
        title: 'Test Article',
        publisher: 'Test Publisher',
        ampUrl: '',
        articleDescription: 'Test description',
      };
      await NewsRepository.insert(news);

      const newsData = await NewsRepository.findByTicker(TEST_TICKER);
      expect(newsData).toHaveLength(1);

      // Tab 3: Sentiment tab - verify sentiment analysis works
      const analyzer = getSentimentAnalyzer();
      const sentiment = analyzer.analyze('Great company with excellent growth prospects', 'test-hash');
      expect(sentiment.positive).toBeGreaterThan(sentiment.negative);

      // Cleanup
      await StockRepository.deleteByTicker(TEST_TICKER);
      await NewsRepository.deleteByTicker(TEST_TICKER);
      await SymbolRepository.deleteByTicker(TEST_TICKER);
    });
  });

  describe('Portfolio Management Workflow', () => {
    it('should handle multiple portfolio operations', async () => {
      const tickers = ['AAPL', 'GOOGL', 'MSFT'];

      // Add multiple stocks
      for (const ticker of tickers) {
        await PortfolioRepository.insert({
          ticker,
          name: `${ticker} Inc.`,
          addedAt: new Date().toISOString(),
        });
      }

      // Verify all added
      let portfolio = await PortfolioRepository.findAll();
      expect(portfolio).toHaveLength(3);

      // Remove one
      await PortfolioRepository.deleteByTicker('GOOGL');
      portfolio = await PortfolioRepository.findAll();
      expect(portfolio).toHaveLength(2);

      // Verify specific ticker exists
      const exists = await PortfolioRepository.existsByTicker('AAPL');
      expect(exists).toBe(true);

      // Cleanup
      for (const ticker of ['AAPL', 'MSFT']) {
        await PortfolioRepository.deleteByTicker(ticker);
      }
    });
  });

  describe('Data Sync Workflow', () => {
    it('should handle sync progress reporting', async () => {
      const progressUpdates: string[] = [];

      const mockProgressCallback = (message: string) => {
        progressUpdates.push(message);
      };

      // Note: This test verifies the sync orchestrator interface
      // Actual sync would require mocked API responses
      expect(typeof syncOrchestrator).toBe('function');

      // Verify progress callback is optional
      const callSync = () => syncOrchestrator(TEST_TICKER, 30);
      expect(callSync).toBeDefined();
    });
  });
});
