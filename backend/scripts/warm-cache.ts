/**
 * Cache Warming Script
 *
 * Pre-warms DynamoDB cache for popular stocks to improve cache hit rates.
 * Run manually: npm run warm-cache
 *
 * This script:
 * 1. Fetches 30 days of stock prices for popular tickers
 * 2. Fetches 50 news articles for each ticker
 * 3. Caches all data in DynamoDB
 *
 * Idempotent: Safe to run multiple times (skips already cached data)
 */

import { fetchStockPrices } from '../src/services/tiingo.service.js';
import { fetchCompanyNews } from '../src/services/finnhub.service.js';
import {
  queryStocksByDateRange,
  batchPutStocks,
} from '../src/repositories/stocksCache.repository.js';
import {
  queryArticlesByTicker,
  batchPutArticles,
  existsInCache,
} from '../src/repositories/newsCache.repository.js';
import { generateArticleHash } from '../src/utils/hash.util.js';
import { transformTiingoToCache, transformFinnhubToCache } from '../src/utils/cacheTransform.util.js';
import type { FinnhubNewsArticle } from '../src/types/finnhub.types.js';

// Popular tickers to warm cache for
const POPULAR_TICKERS = [
  'AAPL', // Apple
  'GOOGL', // Google/Alphabet
  'MSFT', // Microsoft
  'AMZN', // Amazon
  'TSLA', // Tesla
  'NVDA', // NVIDIA
  'META', // Meta/Facebook
  'BRK.B', // Berkshire Hathaway
  'JPM', // JP Morgan
  'V', // Visa
];

// Configuration
const DAYS_TO_FETCH = 30;
const NEWS_LIMIT = 50;

/**
 * Calculate date N days ago in YYYY-MM-DD format
 */
function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function today(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Warm stock prices cache for a ticker
 */
async function warmStockPrices(ticker: string, startDate: string, endDate: string, apiKey: string): Promise<void> {
  console.log(`[WarmCache] Checking stock prices for ${ticker}...`);

  try {
    // Check if already cached
    const cachedData = await queryStocksByDateRange(ticker, startDate, endDate);

    // Calculate cache coverage based on trading days (markets trade ~5/7 days)
    const calendarDays = Math.ceil(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    const expectedTradingDays = Math.ceil(calendarDays * 5 / 7); // Approximate weekdays only
    const cachedDays = cachedData.length;
    const coveragePercent = expectedTradingDays > 0 ? (cachedDays / expectedTradingDays) * 100 : 0;

    console.log(`[WarmCache] ${ticker} stock prices: ${cachedDays}/${expectedTradingDays} trading days cached (${coveragePercent.toFixed(1)}%)`);

    // If coverage is >80%, skip fetching
    if (coveragePercent > 80) {
      console.log(`[WarmCache] ✓ ${ticker} stock prices already cached (${coveragePercent.toFixed(1)}% coverage)`);
      return;
    }

    // Fetch from Tiingo
    console.log(`[WarmCache] Fetching ${ticker} stock prices from Tiingo...`);
    const apiData = await fetchStockPrices(ticker, startDate, endDate, apiKey);

    if (apiData.length === 0) {
      console.log(`[WarmCache] ⚠ No stock data returned for ${ticker}`);
      return;
    }

    // Cache the data
    const cacheItems = transformTiingoToCache(ticker, apiData);
    await batchPutStocks(cacheItems);

    console.log(`[WarmCache] ✓ Cached ${apiData.length} price records for ${ticker}`);
  } catch (error) {
    console.error(`[WarmCache] ✗ Error warming stock prices for ${ticker}:`, error);
  }
}

/**
 * Warm news cache for a ticker
 */
async function warmNews(ticker: string, from: string, to: string, apiKey: string): Promise<void> {
  console.log(`[WarmCache] Checking news for ${ticker}...`);

  try {
    // Check if already cached
    const cachedArticles = await queryArticlesByTicker(ticker);

    // Filter by date range
    const cachedInRange = cachedArticles.filter(
      (item) => item.article.date >= from && item.article.date <= to
    );

    console.log(`[WarmCache] ${ticker} news: ${cachedInRange.length} articles cached`);

    // If we have at least NEWS_LIMIT/2 articles, skip fetching
    if (cachedInRange.length >= NEWS_LIMIT / 2) {
      console.log(`[WarmCache] ✓ ${ticker} news already cached (${cachedInRange.length} articles)`);
      return;
    }

    // Fetch from Finnhub
    console.log(`[WarmCache] Fetching ${ticker} news from Finnhub...`);
    const apiArticles = await fetchCompanyNews(ticker, from, to, apiKey);

    if (apiArticles.length === 0) {
      console.log(`[WarmCache] ⚠ No news articles returned for ${ticker}`);
      return;
    }

    // Filter out duplicates
    const newArticles: FinnhubNewsArticle[] = [];
    let duplicateCount = 0;

    for (const article of apiArticles) {
      const hash = generateArticleHash(article.url);
      const exists = await existsInCache(ticker, hash);

      if (!exists) {
        newArticles.push(article);
      } else {
        duplicateCount++;
      }
    }

    console.log(`[WarmCache] ${ticker} news: ${newArticles.length} new, ${duplicateCount} duplicates`);

    if (newArticles.length === 0) {
      console.log(`[WarmCache] ✓ ${ticker} news already cached (all duplicates)`);
      return;
    }

    // Cache new articles
    const cacheItems = newArticles.map((article) => transformFinnhubToCache(ticker, article));
    await batchPutArticles(cacheItems);

    console.log(`[WarmCache] ✓ Cached ${newArticles.length} news articles for ${ticker}`);
  } catch (error) {
    console.error(`[WarmCache] ✗ Error warming news for ${ticker}:`, error);
  }
}

/**
 * Main cache warming function
 */
async function warmCache(): Promise<void> {
  console.log('========================================');
  console.log('Cache Warming Script');
  console.log('========================================');
  console.log(`Tickers: ${POPULAR_TICKERS.join(', ')}`);
  console.log(`Date range: Last ${DAYS_TO_FETCH} days`);
  console.log(`News limit: ${NEWS_LIMIT} articles per ticker`);
  console.log('========================================\n');

  // Validate API keys
  const tiingoApiKey = process.env.TIINGO_API_KEY;
  const finnhubApiKey = process.env.FINNHUB_API_KEY;

  if (!tiingoApiKey) {
    console.error('✗ Error: TIINGO_API_KEY environment variable not set');
    console.error('Set it in .env or export it before running this script');
    process.exit(1);
  }

  if (!finnhubApiKey) {
    console.error('✗ Error: FINNHUB_API_KEY environment variable not set');
    console.error('Set it in .env or export it before running this script');
    process.exit(1);
  }

  const startDate = daysAgo(DAYS_TO_FETCH);
  const endDate = today();

  const overallStartTime = Date.now();

  // Warm cache for each ticker
  for (const ticker of POPULAR_TICKERS) {
    console.log(`\n--- Processing ${ticker} ---`);
    const tickerStartTime = Date.now();

    try {
      // Warm stock prices
      await warmStockPrices(ticker, startDate, endDate, tiingoApiKey);

      // Warm news
      await warmNews(ticker, startDate, endDate, finnhubApiKey);

      const tickerDuration = Date.now() - tickerStartTime;
      console.log(`[WarmCache] ${ticker} completed in ${(tickerDuration / 1000).toFixed(1)}s`);
    } catch (error) {
      console.error(`[WarmCache] ✗ Error processing ${ticker}:`, error);
    }

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const overallDuration = Date.now() - overallStartTime;

  console.log('\n========================================');
  console.log('Cache Warming Complete');
  console.log('========================================');
  console.log(`Total time: ${(overallDuration / 1000).toFixed(1)}s`);
  console.log(`Tickers processed: ${POPULAR_TICKERS.length}`);
  console.log('========================================');
}

// Run the script
warmCache()
  .then(() => {
    console.log('\n✓ Cache warming successful');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Cache warming failed:', error);
    process.exit(1);
  });
