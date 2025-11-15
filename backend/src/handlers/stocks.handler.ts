/**
 * Stocks handler for Tiingo API proxy with DynamoDB caching
 */

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { successResponse, errorResponse, type APIGatewayResponse } from '../utils/response.util';
import { logError } from '../utils/error.util';
import { logMetrics, MetricUnit } from '../utils/metrics.util';
import { transformTiingoToCache, transformCacheToTiingo } from '../utils/cacheTransform.util';
import { fetchStockPrices, fetchSymbolMetadata } from '../services/tiingo.service';
import {
  queryStocksByDateRange,
  batchPutStocks,
} from '../repositories/stocksCache.repository';
import type { TiingoStockPrice, TiingoSymbolMetadata } from '../types/tiingo.types';

/**
 * Generate array of dates between start and end (inclusive)
 * Helper for checking cache coverage
 */
function generateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Ensure valid date range
  if (start > end) {
    return [];
  }

  const current = new Date(start);
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * Handle stock prices request with three-tier caching
 */
async function handlePricesRequest(
  ticker: string,
  startDate: string,
  endDate: string | undefined,
  apiKey: string
): Promise<{ data: TiingoStockPrice[]; cached: boolean; cacheHitRate: number }> {
  const effectiveEndDate = endDate || new Date().toISOString().split('T')[0];

  try {
    // Tier 1: Check DynamoDB cache
    const cachedData = await queryStocksByDateRange(ticker, startDate, effectiveEndDate);

    // Calculate expected trading days (markets trade ~5/7 days - Mon-Fri, excluding holidays)
    const calendarDays = generateDateRange(startDate, effectiveEndDate).length;
    const expectedTradingDays = Math.ceil(calendarDays * 5 / 7); // Approximate weekdays only

    // Calculate cache hit rate based on trading days, not calendar days
    const cacheHitRate = expectedTradingDays > 0
      ? cachedData.length / expectedTradingDays
      : 0;

    // If cache hit rate is >80%, use cached data
    if (cacheHitRate > 0.8 && cachedData.length > 0) {
      console.log(`[StocksHandler] Cache hit for ${ticker}: ${(cacheHitRate * 100).toFixed(1)}%`);

      // Log metrics for cache hit
      logMetrics(
        [
          { name: 'CacheHitRate', value: cacheHitRate * 100, unit: MetricUnit.Percent },
          { name: 'ApiCallCount', value: 0, unit: MetricUnit.Count },
          { name: 'CachedRecordCount', value: cachedData.length, unit: MetricUnit.Count },
        ],
        { Endpoint: 'stocks', Ticker: ticker, CacheHit: 'true' }
      );

      return {
        data: transformCacheToTiingo(cachedData),
        cached: true,
        cacheHitRate,
      };
    }

    // Tier 2: Cache miss or insufficient coverage - fetch from Tiingo
    console.log(`[StocksHandler] Cache miss for ${ticker}: ${(cacheHitRate * 100).toFixed(1)}% - fetching from API`);
    const apiData = await fetchStockPrices(ticker, startDate, effectiveEndDate, apiKey);

    // Log metrics for cache miss
    logMetrics(
      [
        { name: 'CacheHitRate', value: cacheHitRate * 100, unit: MetricUnit.Percent },
        { name: 'ApiCallCount', value: 1, unit: MetricUnit.Count },
        { name: 'FetchedRecordCount', value: apiData.length, unit: MetricUnit.Count },
      ],
      { Endpoint: 'stocks', Ticker: ticker, CacheHit: 'false' }
    );

    // Tier 3: Cache the fetched data
    if (apiData.length > 0) {
      try {
        const cacheItems = transformTiingoToCache(ticker, apiData);
        await batchPutStocks(cacheItems);
        console.log(`[StocksHandler] Cached ${apiData.length} price records for ${ticker}`);
      } catch (cacheError) {
        // Log cache error but don't fail the request
        console.error('[StocksHandler] Failed to cache stock prices:', cacheError);
      }
    }

    return {
      data: apiData,
      cached: false,
      cacheHitRate,
    };
  } catch (error) {
    // If DynamoDB cache check fails, fall back to direct API call
    console.warn('[StocksHandler] Cache check failed, falling back to API:', error);

    const apiData = await fetchStockPrices(ticker, startDate, effectiveEndDate, apiKey);

    return {
      data: apiData,
      cached: false,
      cacheHitRate: 0,
    };
  }
}

/**
 * Handle symbol metadata request (simplified - no caching for MVP)
 * TODO: Add metadata caching in future iteration
 */
async function handleMetadataRequest(
  ticker: string,
  apiKey: string
): Promise<{ data: TiingoSymbolMetadata; cached: boolean }> {
  const apiData = await fetchSymbolMetadata(ticker, apiKey);

  return {
    data: apiData,
    cached: false, // Not cached yet
  };
}

/**
 * Handle stocks requests (proxy to Tiingo API with DynamoDB caching)
 * @param event - API Gateway event
 * @returns API Gateway response
 */
export async function handleStocksRequest(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayResponse> {
  const requestId = event.requestContext.requestId;
  const startTime = Date.now();

  try {
    // Parse query parameters
    const params = event.queryStringParameters || {};
    const ticker = params.ticker?.toUpperCase();
    const startDate = params.startDate;
    const endDate = params.endDate;
    const type = params.type || 'prices'; // 'prices' or 'metadata'

    // Validate required parameters
    if (!ticker) {
      return errorResponse('Missing required parameter: ticker', 400);
    }

    // Validate ticker format (alphanumeric, dots, and hyphens allowed)
    const normalizedTicker = ticker.toUpperCase();
    if (!/^[A-Z0-9.-]+$/.test(normalizedTicker)) {
      return errorResponse('Invalid ticker format. Must contain only letters, numbers, dots, and hyphens.', 400);
    }

    // Validate type
    if (type !== 'prices' && type !== 'metadata') {
      return errorResponse('Invalid type. Must be "prices" or "metadata".', 400);
    }

    // Validate dates if provided
    if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return errorResponse('Invalid startDate format. Must be YYYY-MM-DD.', 400);
    }

    if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return errorResponse('Invalid endDate format. Must be YYYY-MM-DD.', 400);
    }

    // Validate date range (startDate must be <= endDate)
    if (type === 'prices' && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (start > end) {
        return errorResponse('Invalid date range. startDate must be before or equal to endDate.', 400);
      }
    }

    // Get API key from environment
    const apiKey = process.env.TIINGO_API_KEY;
    if (!apiKey) {
      logError('StocksHandler', new Error('TIINGO_API_KEY not configured'), { requestId });
      return errorResponse('Server configuration error', 500);
    }

    // Route based on type
    let result: { data: any; cached: boolean; cacheHitRate?: number };

    if (type === 'metadata') {
      result = await handleMetadataRequest(ticker, apiKey);
    } else {
      // Type is 'prices'
      if (!startDate) {
        return errorResponse('Missing required parameter for prices: startDate', 400);
      }
      result = await handlePricesRequest(ticker, startDate, endDate, apiKey);
    }

    // Calculate request duration
    const duration = Date.now() - startTime;

    // Log request duration metric
    logMetrics(
      [{ name: 'RequestDuration', value: duration, unit: MetricUnit.Milliseconds }],
      {
        Endpoint: 'stocks',
        Type: type,
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
          cacheHitRate: result.cacheHitRate !== undefined ? result.cacheHitRate : null,
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
        Endpoint: 'stocks',
        Error: 'true',
      }
    );

    logError('StocksHandler', error, { requestId });

    // Extract error message and status
    const message = error instanceof Error ? error.message : 'Internal server error';
    const statusCode = (error as any).statusCode || 500;

    return errorResponse(message, statusCode);
  }
}
