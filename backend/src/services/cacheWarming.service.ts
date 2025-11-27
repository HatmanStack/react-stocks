/**
 * Cache Warming Service
 * Pre-warms DynamoDB cache for popular tickers
 */

import { fetchStockPrices } from './tiingo.service';
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

interface WarmCacheResult {
  stocks: boolean;
  news: boolean;
}

/**
 * Warm cache for a single ticker
 * Returns result indicating which operations succeeded
 */
export async function warmCache(ticker: string): Promise<WarmCacheResult> {
  const result: WarmCacheResult = { stocks: false, news: false };

  const tiingoApiKey = process.env.TIINGO_API_KEY;
  const finnhubApiKey = process.env.FINNHUB_API_KEY;

  if (!tiingoApiKey) {
    logError('CacheWarming', new Error('TIINGO_API_KEY not configured'), { ticker });
    return result;
  }
  if (!finnhubApiKey) {
    logError('CacheWarming', new Error('FINNHUB_API_KEY not configured'), { ticker });
    return result;
  }

  const now = new Date();
  const endDate = now.toISOString().split('T')[0];
  const startDateDate = new Date();
  startDateDate.setDate(now.getDate() - 30);
  const startDate = startDateDate.toISOString().split('T')[0];

  // 1. Warm Stock Prices
  try {
    const prices = await fetchStockPrices(ticker, startDate, endDate, tiingoApiKey);
    if (prices.length > 0) {
      const cacheItems = transformTiingoToCache(ticker, prices);
      await batchPutStocks(cacheItems);
      console.log(`[CacheWarming] Warmed stock prices for ${ticker}: ${prices.length} records`);
    }
    result.stocks = true;
  } catch (error) {
    logError('CacheWarming', error, { ticker, action: 'warmStocks' });
  }

  // 2. Warm News
  try {
    const newsStartDateDate = new Date();
    newsStartDateDate.setDate(now.getDate() - 7);
    const newsStartDate = newsStartDateDate.toISOString().split('T')[0];

    const articles = await fetchCompanyNews(ticker, newsStartDate, endDate, finnhubApiKey);
    if (articles.length > 0) {
      const cacheItems = articles.map(article =>
        transformFinnhubToCache(ticker, article, generateArticleHash(article.url))
      );
      await batchPutArticles(cacheItems);
      console.log(`[CacheWarming] Warmed news for ${ticker}: ${articles.length} articles`);
    }
    result.news = true;
  } catch (error) {
    logError('CacheWarming', error, { ticker, action: 'warmNews' });
  }

  return result;
}

/**
 * Warm cache for all top tickers
 */
export async function warmAllTopTickers(): Promise<{ success: number; failure: number }> {
  const tickers = await getTopTickers();
  console.log(`[CacheWarming] Starting warming for ${tickers.length} tickers`);

  const results = await Promise.all(tickers.map(ticker => warmCache(ticker)));

  // Count as success only if both stocks and news succeeded
  const success = results.filter(r => r.stocks && r.news).length;
  const failure = results.filter(r => !r.stocks || !r.news).length;

  return { success, failure };
}
