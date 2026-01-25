/**
 * News handler for Finnhub API proxy with DynamoDB caching
 */

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { successResponse, errorResponse, type APIGatewayResponse } from '../utils/response.util';
import { logError, hasStatusCode } from '../utils/error.util';
import { validateTicker, validateDateFormat } from '../utils/validation.util';
import { logMetrics, MetricUnit } from '../utils/metrics.util';
import { transformFinnhubToCache, transformCacheToFinnhub } from '../utils/cacheTransform.util';
import { generateArticleHash } from '../utils/hash.util';
import { fetchCompanyNews } from '../services/finnhub.service';
import { fetchAlphaVantageNews } from '../services/alphavantage.service';
import {
  queryArticlesByTicker,
  batchPutArticles,
  existsInCache,
} from '../repositories/newsCache.repository';
import type { FinnhubNewsArticle } from '../types/finnhub.types';
import { MIN_DAYS_FOR_PREDICTIONS } from '../constants/ml.constants.js';

/** Alpha Vantage: Fetch 5 years to maximize value of limited API calls (25/day free tier)
 *  API returns max 1000 articles, sorted by most recent - older articles truncated for popular stocks */
const ALPHA_VANTAGE_LOOKBACK_DAYS = 365 * 5; // 5 years

/**
 * Filter out articles already in cache
 * Returns only new articles with pre-computed hashes to avoid double hashing
 */
async function filterNewArticles(
  ticker: string,
  apiArticles: FinnhubNewsArticle[]
): Promise<{
  newArticles: { article: FinnhubNewsArticle; hash: string }[];
  duplicateCount: number;
}> {
  const newArticles: { article: FinnhubNewsArticle; hash: string }[] = [];
  let duplicateCount = 0;

  for (const article of apiArticles) {
    const hash = generateArticleHash(article.url);
    const exists = await existsInCache(ticker, hash);

    if (!exists) {
      newArticles.push({ article, hash }); // Return hash to avoid recomputing
    } else {
      duplicateCount++;
    }
  }

  return { newArticles, duplicateCount };
}

/**
 * Handle news request with three-tier caching
 * Falls back to Alpha Vantage when Finnhub returns limited historical data
 */
export async function handleNewsWithCache(
  ticker: string,
  from: string,
  to: string,
  apiKey: string,
  alphaVantageKey?: string
): Promise<{
  data: FinnhubNewsArticle[];
  cached: boolean;
  newArticlesCount: number;
  cachedArticlesCount: number;
  source?: 'finnhub' | 'alphavantage' | 'cache';
}> {
  try {
    // Tier 1: Check DynamoDB cache
    const cachedItems = await queryArticlesByTicker(ticker);

    // Filter cached articles by date range
    const cachedInRange = cachedItems.filter((item) => {
      return item.article.date >= from && item.article.date <= to;
    });

    console.log(`[NewsHandler] Found ${cachedInRange.length} cached articles for ${ticker} (${from} to ${to})`);

    // Calculate date range coverage
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const totalDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // Count unique days with articles
    const daysWithArticles = new Set(cachedInRange.map(item => item.article.date)).size;
    const coverageRatio = daysWithArticles / totalDays;

    console.log(`[NewsHandler] Coverage: ${daysWithArticles}/${totalDays} days (${(coverageRatio * 100).toFixed(1)}%)`);

    // Tier 2: Determine if we need to fetch from API
    // Adaptive coverage threshold based on date range:
    // - Short ranges (< 60 days): require 30% coverage (news doesn't come every day)
    // - Medium ranges (60-180 days): require 15% coverage
    // - Long ranges (> 180 days): require 10 articles AND at least 15 unique days
    //   (Finnhub returns max ~250 articles, so coverage % is naturally lower for long ranges)
    let hasGoodCoverage: boolean;
    if (totalDays <= 60) {
      hasGoodCoverage = cachedInRange.length >= 10 && coverageRatio >= 0.3;
    } else if (totalDays <= 180) {
      hasGoodCoverage = cachedInRange.length >= 10 && coverageRatio >= 0.15;
    } else {
      // For long ranges, just check we have reasonable data (15+ unique days)
      hasGoodCoverage = cachedInRange.length >= 10 && daysWithArticles >= 15;
    }

    if (hasGoodCoverage) {
      console.log(`[NewsHandler] Cache hit for ${ticker}: ${cachedInRange.length} articles with ${(coverageRatio * 100).toFixed(1)}% coverage`);

      // Log metrics for cache hit
      logMetrics(
        [
          { name: 'CachedArticleCount', value: cachedInRange.length, unit: MetricUnit.Count },
          { name: 'ApiCallCount', value: 0, unit: MetricUnit.Count },
        ],
        { Endpoint: 'news', Ticker: ticker, CacheHit: 'true' }
      );

      // Sort by date descending (most recent first)
      const sortedCached = cachedInRange.sort((a, b) =>
        b.article.date.localeCompare(a.article.date)
      );

      return {
        data: sortedCached.map(transformCacheToFinnhub),
        cached: true,
        newArticlesCount: 0,
        cachedArticlesCount: cachedInRange.length,
        source: 'cache',
      };
    }

    // Tier 3: Cache miss or insufficient coverage - fetch from Finnhub
    console.log(`[NewsHandler] Cache miss for ${ticker}: fetching from API`);
    let apiCallCount = 1; // Finnhub always called
    let apiArticles = await fetchCompanyNews(ticker, from, to, apiKey);
    let newsSource: 'finnhub' | 'alphavantage' = 'finnhub';

    // Check if Finnhub returned limited data (< MIN_DAYS_FOR_PREDICTIONS unique days)
    const finnhubUniqueDays = new Set(
      apiArticles.map((a) => {
        const date = new Date(a.datetime * 1000);
        return date.toISOString().split('T')[0];
      })
    ).size;

    console.log(`[NewsHandler] Finnhub returned ${apiArticles.length} articles spanning ${finnhubUniqueDays} days`);

    // Check TOTAL cache coverage (not just requested range) to decide if we need Alpha Vantage
    const totalCachedDays = new Set(cachedItems.map(item => item.article.date)).size;
    const needsHistoricalData = totalCachedDays < MIN_DAYS_FOR_PREDICTIONS && finnhubUniqueDays < MIN_DAYS_FOR_PREDICTIONS;

    // Fall back to Alpha Vantage if we don't have enough historical data anywhere
    // Fetch 5 YEARS to maximize value of limited API calls (25/day free tier)
    if (needsHistoricalData && alphaVantageKey) {
      console.log(`[NewsHandler] Insufficient historical data (cache: ${totalCachedDays} days, Finnhub: ${finnhubUniqueDays} days)`);
      console.log(`[NewsHandler] Fetching 5 YEARS from Alpha Vantage to maximize API call value (max 1000 articles)...`);

      try {
        // Calculate 5 year lookback date
        const today = new Date();
        const lookbackDate = new Date(today);
        lookbackDate.setDate(lookbackDate.getDate() - ALPHA_VANTAGE_LOOKBACK_DAYS);
        const alphaFrom = lookbackDate.toISOString().split('T')[0];
        const alphaTo = today.toISOString().split('T')[0];

        apiCallCount++;
        const alphaArticles = await fetchAlphaVantageNews(ticker, alphaFrom, alphaTo, alphaVantageKey);
        const alphaUniqueDays = new Set(
          alphaArticles.map((a) => {
            const date = new Date(a.datetime * 1000);
            return date.toISOString().split('T')[0];
          })
        ).size;

        console.log(`[NewsHandler] Alpha Vantage returned ${alphaArticles.length} articles spanning ${alphaUniqueDays} days (5 year fetch, max 1000)`);

        if (alphaArticles.length > 0) {
          // Cache ALL Alpha Vantage articles — batchPutArticles overwrites duplicates
          try {
            const cacheItems = alphaArticles.map((article) =>
              transformFinnhubToCache(ticker, article)
            );
            await batchPutArticles(cacheItems);
            console.log(`[NewsHandler] Cached ${alphaArticles.length} Alpha Vantage articles`);
          } catch (cacheError) {
            console.error('[NewsHandler] Failed to cache Alpha Vantage articles:', cacheError);
          }

          // Filter to requested date range for response
          const alphaInRange = alphaArticles.filter((a) => {
            const date = new Date(a.datetime * 1000).toISOString().split('T')[0];
            return date >= from && date <= to;
          });

          // Use Alpha Vantage data if it provides better coverage for the requested range
          const alphaInRangeDays = new Set(
            alphaInRange.map((a) => new Date(a.datetime * 1000).toISOString().split('T')[0])
          ).size;

          if (alphaInRangeDays > finnhubUniqueDays) {
            apiArticles = alphaInRange;
            newsSource = 'alphavantage';
            console.log(`[NewsHandler] Using Alpha Vantage data for response (${alphaInRangeDays} days in range)`);
          }
        }
      } catch (alphaError) {
        console.warn(`[NewsHandler] Alpha Vantage fallback failed:`, alphaError);
        // Continue with Finnhub data
      }
    } else if (alphaVantageKey && totalCachedDays >= MIN_DAYS_FOR_PREDICTIONS) {
      console.log(`[NewsHandler] Sufficient historical data in cache (${totalCachedDays} days), skipping Alpha Vantage API call`);
    }

    // Filter out articles already in cache
    const { newArticles, duplicateCount } = await filterNewArticles(ticker, apiArticles);

    console.log(`[NewsHandler] API returned ${apiArticles.length} articles: ${newArticles.length} new, ${duplicateCount} duplicates`);

    // Log metrics for cache miss
    logMetrics(
      [
        { name: 'NewArticleCount', value: newArticles.length, unit: MetricUnit.Count },
        { name: 'DuplicateArticleCount', value: duplicateCount, unit: MetricUnit.Count },
        { name: 'ApiCallCount', value: apiCallCount, unit: MetricUnit.Count },
      ],
      { Endpoint: 'news', Ticker: ticker, CacheHit: 'false' }
    );

    // Cache only new articles using pre-computed hashes
    if (newArticles.length > 0) {
      try {
        const cacheItems = newArticles.map(({ article, hash }) =>
          transformFinnhubToCache(ticker, article, hash)
        );
        await batchPutArticles(cacheItems);
        console.log(`[NewsHandler] Cached ${newArticles.length} new articles for ${ticker}`);
      } catch (cacheError) {
        // Log cache error but don't fail the request
        console.error('[NewsHandler] Failed to cache news articles:', cacheError);
      }
    }

    return {
      data: apiArticles,
      cached: false,
      newArticlesCount: newArticles.length,
      cachedArticlesCount: cachedInRange.length,
      source: newsSource,
    };
  } catch (error) {
    // If DynamoDB cache check fails, fall back to direct API call
    console.warn('[NewsHandler] Cache check failed, falling back to API:', error);

    const apiArticles = await fetchCompanyNews(ticker, from, to, apiKey);

    return {
      data: apiArticles,
      cached: false,
      newArticlesCount: apiArticles.length,
      cachedArticlesCount: 0,
      source: 'finnhub',
    };
  }
}

/**
 * Handle news requests (proxy to Finnhub API with DynamoDB caching)
 * @param event - API Gateway event
 * @returns API Gateway response
 */
export async function handleNewsRequest(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayResponse> {
  const requestId = event.requestContext.requestId;
  const startTime = Date.now();

  try {
    // Parse query parameters
    const params = event.queryStringParameters || {};
    const ticker = params.ticker?.toUpperCase();
    const from = params.from;
    const to = params.to;

    // Validate required parameters
    if (!ticker) {
      return errorResponse('Missing required parameter: ticker', 400);
    }

    // Validate ticker format (strict: Finnhub requires alphanumeric only)
    if (!validateTicker(ticker, true)) {
      return errorResponse('Invalid ticker format. Must be alphanumeric.', 400);
    }

    // Validate date parameters (Finnhub requires from and to)
    if (!from || !to) {
      return errorResponse('Missing required parameters: from and to dates (YYYY-MM-DD)', 400);
    }

    // Validate date format (YYYY-MM-DD)
    if (!validateDateFormat(from) || !validateDateFormat(to)) {
      return errorResponse('Invalid date format. Use YYYY-MM-DD.', 400);
    }

    // Validate date range (from must be <= to)
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (fromDate > toDate) {
      return errorResponse('Invalid date range. from date must be before or equal to to date.', 400);
    }

    // Get API keys from environment
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      logError('NewsHandler', new Error('FINNHUB_API_KEY not configured'), { requestId });
      return errorResponse('Server configuration error', 500);
    }

    // Alpha Vantage is optional - used as fallback for historical data
    const alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;

    // Fetch news with caching (Alpha Vantage fallback if configured)
    const result = await handleNewsWithCache(ticker, from, to, apiKey, alphaVantageKey);

    // Calculate request duration
    const duration = Date.now() - startTime;

    // Log request duration metric
    logMetrics(
      [{ name: 'RequestDuration', value: duration, unit: MetricUnit.Milliseconds }],
      {
        Endpoint: 'news',
        Cached: String(result.cached),
      }
    );

    // Return response with cache metadata
    return successResponse(
      result.data,
      200,
      {
        _meta: {
          cached: result.cached,
          source: result.source,
          newArticles: result.newArticlesCount,
          cachedArticles: result.cachedArticlesCount,
          timestamp: new Date().toISOString(),
        },
      }
    );
  } catch (error) {
    const duration = Date.now() - startTime;

    // Log error duration metric
    logMetrics(
      [{ name: 'RequestDuration', value: duration, unit: MetricUnit.Milliseconds }],
      {
        Endpoint: 'news',
        Error: 'true',
      }
    );

    logError('NewsHandler', error, { requestId });

    // Extract error message and status
    const message = error instanceof Error ? error.message : 'Internal server error';
    const statusCode = hasStatusCode(error) ? error.statusCode : 500;

    return errorResponse(message, statusCode);
  }
}
