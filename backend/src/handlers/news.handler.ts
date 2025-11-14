/**
 * News handler for Finnhub API proxy with DynamoDB caching
 */

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { successResponse, errorResponse, type APIGatewayResponse } from '../utils/response.util';
import { logError } from '../utils/error.util';
import { fetchCompanyNews } from '../services/finnhub.service';
import {
  queryArticlesByTicker,
  batchPutArticles,
  existsInCache,
  type NewsCacheItem,
} from '../repositories/newsCache.repository';
import { generateArticleHash } from '../utils/hash.util';
import type { FinnhubNewsArticle } from '../types/finnhub.types';

/**
 * Transform Finnhub article to cache format
 */
function transformFinnhubToCache(ticker: string, finnhubArticle: FinnhubNewsArticle): Omit<NewsCacheItem, 'ttl'> {
  // Convert Unix timestamp to ISO date string
  const date = new Date(finnhubArticle.datetime * 1000).toISOString().split('T')[0];

  return {
    ticker,
    articleHash: generateArticleHash(finnhubArticle.url),
    article: {
      title: finnhubArticle.headline,
      url: finnhubArticle.url,
      description: finnhubArticle.summary,
      date,
      publisher: finnhubArticle.source,
      imageUrl: finnhubArticle.image,
    },
    fetchedAt: Date.now(),
  };
}

/**
 * Transform cached article to Finnhub format for response
 */
function transformCacheToFinnhub(cacheItem: NewsCacheItem): FinnhubNewsArticle {
  // Convert ISO date string back to Unix timestamp (approximate - use noon UTC)
  const datetime = Math.floor(new Date(`${cacheItem.article.date}T12:00:00Z`).getTime() / 1000);

  return {
    category: 'general', // Cached articles don't have category info
    datetime,
    headline: cacheItem.article.title,
    id: 0, // Generated ID not available for cached articles
    image: cacheItem.article.imageUrl || '',
    related: '', // Not stored in cache
    source: cacheItem.article.publisher || '',
    summary: cacheItem.article.description || '',
    url: cacheItem.article.url,
  };
}

/**
 * Filter out articles already in cache
 * Returns only new articles that need to be cached
 */
async function filterNewArticles(
  ticker: string,
  apiArticles: FinnhubNewsArticle[]
): Promise<{ newArticles: FinnhubNewsArticle[]; duplicateCount: number }> {
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

    // Cache only new articles
    if (newArticles.length > 0) {
      try {
        const cacheItems = newArticles.map((article) =>
          transformFinnhubToCache(ticker, article)
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

    // Get API key from environment
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      logError('NewsHandler', new Error('FINNHUB_API_KEY not configured'), { requestId });
      return errorResponse('Server configuration error', 500);
    }

    // Fetch news with caching
    const result = await handleNewsWithCache(ticker, from, to, apiKey);

    // Return response with cache metadata
    return successResponse({
      data: result.data,
      _meta: {
        cached: result.cached,
        newArticles: result.newArticlesCount,
        cachedArticles: result.cachedArticlesCount,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logError('NewsHandler', error, { requestId });

    // Extract error message and status
    const message = error instanceof Error ? error.message : 'Internal server error';
    const statusCode = (error as any).statusCode || 500;

    return errorResponse(message, statusCode);
  }
}
