/**
 * News handler for Finnhub API proxy with DynamoDB caching
 */

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { successResponse, errorResponse, type APIGatewayResponse } from '../utils/response.util';
import { logError } from '../utils/error.util';
import { logMetrics, MetricUnit } from '../utils/metrics.util';
import { transformFinnhubToCache, transformCacheToFinnhub } from '../utils/cacheTransform.util';
import { generateArticleHash } from '../utils/hash.util';
import { fetchCompanyNews } from '../services/finnhub.service';
import {
  queryArticlesByTicker,
  batchPutArticles,
  existsInCache,
} from '../repositories/newsCache.repository';
import type { FinnhubNewsArticle } from '../types/finnhub.types';

/**
 * Filter out articles already in cache
 * Returns only new articles with pre-computed hashes to avoid double hashing
 */
async function filterNewArticles(
  ticker: string,
  apiArticles: FinnhubNewsArticle[]
): Promise<{
  newArticles: Array<{ article: FinnhubNewsArticle; hash: string }>;
  duplicateCount: number;
}> {
  const newArticles: Array<{ article: FinnhubNewsArticle; hash: string }> = [];
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
 */
async function handleNewsWithCache(
  ticker: string,
  from: string,
  to: string,
  apiKey: string
): Promise<{
  data: FinnhubNewsArticle[];
  cached: boolean;
  newArticlesCount: number;
  cachedArticlesCount: number;
}> {
  try {
    // Tier 1: Check DynamoDB cache
    const cachedItems = await queryArticlesByTicker(ticker);

    // Filter cached articles by date range
    const cachedInRange = cachedItems.filter((item) => {
      return item.article.date >= from && item.article.date <= to;
    });

    console.log(`[NewsHandler] Found ${cachedInRange.length} cached articles for ${ticker} (${from} to ${to})`);

    // Tier 2: Determine if we need to fetch from API
    // If we have at least 10 recent articles cached, use cache
    if (cachedInRange.length >= 10) {
      console.log(`[NewsHandler] Cache hit for ${ticker}: ${cachedInRange.length} articles`);

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
      };
    }

    // Tier 3: Cache miss or insufficient coverage - fetch from Finnhub
    console.log(`[NewsHandler] Cache miss for ${ticker}: fetching from API`);
    const apiArticles = await fetchCompanyNews(ticker, from, to, apiKey);

    // Filter out articles already in cache
    const { newArticles, duplicateCount } = await filterNewArticles(ticker, apiArticles);

    console.log(`[NewsHandler] API returned ${apiArticles.length} articles: ${newArticles.length} new, ${duplicateCount} duplicates`);

    // Log metrics for cache miss
    logMetrics(
      [
        { name: 'NewArticleCount', value: newArticles.length, unit: MetricUnit.Count },
        { name: 'DuplicateArticleCount', value: duplicateCount, unit: MetricUnit.Count },
        { name: 'ApiCallCount', value: 1, unit: MetricUnit.Count },
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

    // Validate ticker format (alphanumeric)
    if (!/^[A-Z0-9]+$/.test(ticker)) {
      return errorResponse('Invalid ticker format. Must be alphanumeric.', 400);
    }

    // Validate date parameters (Finnhub requires from and to)
    if (!from || !to) {
      return errorResponse('Missing required parameters: from and to dates (YYYY-MM-DD)', 400);
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(from) || !dateRegex.test(to)) {
      return errorResponse('Invalid date format. Use YYYY-MM-DD.', 400);
    }

    // Validate date range (from must be <= to)
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (fromDate > toDate) {
      return errorResponse('Invalid date range. from date must be before or equal to to date.', 400);
    }

    // Get API key from environment
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      logError('NewsHandler', new Error('FINNHUB_API_KEY not configured'), { requestId });
      return errorResponse('Server configuration error', 500);
    }

    // Fetch news with caching
    const result = await handleNewsWithCache(ticker, from, to, apiKey);

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
    const statusCode = (error as any).statusCode || 500;

    return errorResponse(message, statusCode);
  }
}
