/**
 * Stocks handler for Tiingo API proxy with DynamoDB caching
 */

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { successResponse, errorResponse, type APIGatewayResponse } from '../utils/response.util';
import { logError } from '../utils/error.util';
import { fetchStockPrices, fetchSymbolMetadata } from '../services/tiingo.service';
import {
  queryStocksByDateRange,
  batchPutStocks,
  type StockCacheItem,
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
 * Transform Tiingo price data to cache format
 */
function transformTiingoToCache(ticker: string, tiingoData: TiingoStockPrice[]): Omit<StockCacheItem, 'ttl'>[] {
  return tiingoData.map((price) => ({
    ticker,
    date: price.date.split('T')[0], // Extract date from ISO timestamp
    priceData: {
      open: price.open,
      high: price.high,
      low: price.low,
      close: price.close,
      volume: price.volume,
      adjOpen: price.adjOpen,
      adjHigh: price.adjHigh,
      adjLow: price.adjLow,
      adjClose: price.adjClose,
      adjVolume: price.adjVolume,
      divCash: price.divCash,
      splitFactor: price.splitFactor,
    },
    fetchedAt: Date.now(),
  }));
}

/**
 * Transform cached stock data back to Tiingo format for response
 */
function transformCacheToTiingo(cacheItems: StockCacheItem[]): TiingoStockPrice[] {
  return cacheItems.map((item) => ({
    date: `${item.date}T00:00:00.000Z`, // Add timestamp for consistency
    open: item.priceData.open,
    high: item.priceData.high,
    low: item.priceData.low,
    close: item.priceData.close,
    volume: item.priceData.volume,
    adjOpen: item.priceData.adjOpen || item.priceData.open,
    adjHigh: item.priceData.adjHigh || item.priceData.high,
    adjLow: item.priceData.adjLow || item.priceData.low,
    adjClose: item.priceData.adjClose || item.priceData.close,
    adjVolume: item.priceData.adjVolume || item.priceData.volume,
    divCash: item.priceData.divCash || 0,
    splitFactor: item.priceData.splitFactor || 1,
  }));
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

    // Generate expected date range (market days only - approximation)
    const expectedDates = generateDateRange(startDate, effectiveEndDate);
    const cachedDates = new Set(cachedData.map((item) => item.date));

    // Calculate cache hit rate
    const cacheHitRate = expectedDates.length > 0
      ? cachedDates.size / expectedDates.length
      : 0;

    // If cache hit rate is >80%, use cached data
    if (cacheHitRate > 0.8 && cachedData.length > 0) {
      console.log(`[StocksHandler] Cache hit for ${ticker}: ${(cacheHitRate * 100).toFixed(1)}%`);

      return {
        data: transformCacheToTiingo(cachedData),
        cached: true,
        cacheHitRate,
      };
    }

    // Tier 2: Cache miss or insufficient coverage - fetch from Tiingo
    console.log(`[StocksHandler] Cache miss for ${ticker}: ${(cacheHitRate * 100).toFixed(1)}% - fetching from API`);
    const apiData = await fetchStockPrices(ticker, startDate, endDate, apiKey);

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

    const apiData = await fetchStockPrices(ticker, startDate, endDate, apiKey);

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

    // Return response with cache metadata
    return successResponse({
      data: result.data,
      _meta: {
        cached: result.cached,
        cacheHitRate: result.cacheHitRate !== undefined ? result.cacheHitRate : null,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logError('StocksHandler', error, { requestId });

    // Extract error message and status
    const message = error instanceof Error ? error.message : 'Internal server error';
    const statusCode = (error as any).statusCode || 500;

    return errorResponse(message, statusCode);
  }
}
