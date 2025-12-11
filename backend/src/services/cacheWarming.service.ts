/**
 * Cache Warming Service
 * Pre-warms DynamoDB cache for popular tickers (news only - stocks handled by Python Lambda)
 */

import { fetchCompanyNews } from './finnhub.service';
import { batchPutArticles } from '../repositories/newsCache.repository';
import { transformFinnhubToCache } from '../utils/cacheTransform.util';
import { generateArticleHash } from '../utils/hash.util';
import { logError } from '../utils/error.util';

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
  news: boolean;
}

/**
 * Warm cache for a single ticker (news only)
 * Stock price caching is handled by the Python Lambda
 */
export async function warmCache(ticker: string): Promise<WarmCacheResult> {
  const result: WarmCacheResult = { news: false };

  const finnhubApiKey = process.env.FINNHUB_API_KEY;

  if (!finnhubApiKey) {
    logError('CacheWarming', new Error('FINNHUB_API_KEY not configured'), { ticker });
    return result;
  }

  const now = new Date();
  const endDate = now.toISOString().split('T')[0];

  // Warm News
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

  const success = results.filter(r => r.news).length;
  const failure = results.filter(r => !r.news).length;

  return { success, failure };
}
