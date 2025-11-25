/**
 * Cache Warming Service
 * Pre-warms DynamoDB cache for popular tickers
 */

import { fetchStockPrices, fetchSymbolMetadata } from './tiingo.service';
import { fetchCompanyNews } from './finnhub.service';
import { batchPutStocks } from '../repositories/stocksCache.repository';
import { batchPutArticles } from '../repositories/newsCache.repository';
import { transformTiingoToCache, transformFinnhubToCache } from '../utils/cacheTransform.util';
import { generateArticleHash } from '../utils/hash.util';
import { logError } from '../utils/error.util';

// Define TopTickersCache DynamoDB access (simplified for now, using hardcoded list or we can implement the table)
// For this task, we'll simulate fetching top tickers or use a hardcoded list if the table isn't populated.
// Ideally, we would query the TopTickersCache table.

const HARDCODED_TOP_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'NFLX', 'AMD', 'INTC'];

/**
 * Get top tickers to warm
 * In a real implementation, this would fetch from TopTickersCache table
 */
export async function getTopTickers(): Promise<string[]> {
  // TODO: Implement DynamoDB fetch from TopTickersCache
  return HARDCODED_TOP_TICKERS;
}

/**
 * Warm cache for a single ticker
 */
export async function warmCache(ticker: string): Promise<void> {
  const now = new Date();
  const endDate = now.toISOString().split('T')[0];
  const startDateDate = new Date();
  startDateDate.setDate(now.getDate() - 30);
  const startDate = startDateDate.toISOString().split('T')[0];

  // 1. Warm Stock Prices
  try {
    const prices = await fetchStockPrices(ticker, startDate, endDate, process.env.TIINGO_API_KEY || '');
    if (prices.length > 0) {
      const cacheItems = transformTiingoToCache(ticker, prices);
      await batchPutStocks(cacheItems);
      console.log(`[CacheWarming] Warmed stock prices for ${ticker}: ${prices.length} records`);
    }
  } catch (error) {
    logError('CacheWarming', error, { ticker, action: 'warmStocks' });
  }

  // 2. Warm News
  try {
    const newsStartDateDate = new Date();
    newsStartDateDate.setDate(now.getDate() - 7);
    const newsStartDate = newsStartDateDate.toISOString().split('T')[0];

    const articles = await fetchCompanyNews(ticker, newsStartDate, endDate, process.env.FINNHUB_API_KEY || '');
    if (articles.length > 0) {
      const cacheItems = articles.map(article =>
        transformFinnhubToCache(ticker, article, generateArticleHash(article.url))
      );
      await batchPutArticles(cacheItems);
      console.log(`[CacheWarming] Warmed news for ${ticker}: ${articles.length} articles`);
    }
  } catch (error) {
    logError('CacheWarming', error, { ticker, action: 'warmNews' });
  }

  // 3. Warm Metadata (Optional, if we had a metadata cache)
  try {
    await fetchSymbolMetadata(ticker, process.env.TIINGO_API_KEY || '');
    // console.log(`[CacheWarming] Warmed metadata for ${ticker}`);
  } catch (error) {
    logError('CacheWarming', error, { ticker, action: 'warmMetadata' });
  }
}

/**
 * Warm cache for all top tickers
 */
export async function warmAllTopTickers(): Promise<{ success: number; failure: number }> {
  const tickers = await getTopTickers();
  console.log(`[CacheWarming] Starting warming for ${tickers.length} tickers`);

  const results = await Promise.allSettled(tickers.map(ticker => warmCache(ticker)));

  const success = results.filter(r => r.status === 'fulfilled').length;
  const failure = results.filter(r => r.status === 'rejected').length;

  return { success, failure };
}
