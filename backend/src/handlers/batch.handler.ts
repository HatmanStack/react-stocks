import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { successResponse, errorResponse, type APIGatewayResponse } from '../utils/response.util';
import { logError } from '../utils/error.util';
import { logMetrics, MetricUnit } from '../utils/metrics.util';
import { handleNewsWithCache } from './news.handler';
import { getSentimentResults } from './sentiment.handler';
import type { FinnhubNewsArticle } from '../types/finnhub.types';

interface BatchNewsRequest {
  tickers: string[];
  limit?: number;
}

interface BatchNewsResponse {
  data: Record<string, FinnhubNewsArticle[]>;
  errors: Record<string, string>;
  _meta: {
    successCount: number;
    errorCount: number;
    cached: Record<string, boolean>;
    timestamp: string;
  };
}

interface BatchSentimentRequest {
  tickers: string[];
  startDate: string;
  endDate?: string;
}

interface BatchSentimentResponse {
  data: Record<string, any[]>; // Simplified type for now
  errors: Record<string, string>;
  _meta: {
    successCount: number;
    errorCount: number;
    cached: Record<string, boolean>;
    timestamp: string;
  };
}

/**
 * Handle batch news request
 * Accepts multiple tickers and returns aggregated news data
 */
export async function handleBatchNewsRequest(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayResponse> {
  const requestId = event.requestContext.requestId;
  const startTime = Date.now();

  try {
    // Parse request body
    if (!event.body) {
      return errorResponse('Missing request body', 400);
    }

    let requestBody: BatchNewsRequest;
    try {
      requestBody = JSON.parse(event.body);
    } catch (e) {
      return errorResponse('Invalid JSON body', 400);
    }

    const { tickers, limit = 10 } = requestBody;

    // Validate tickers
    if (!tickers || !Array.isArray(tickers)) {
      return errorResponse('Missing or invalid "tickers" field. Must be an array of strings.', 400);
    }

    if (tickers.length === 0) {
      return errorResponse('Tickers array cannot be empty', 400);
    }

    // Rate limiting: Max 10 tickers per batch
    if (tickers.length > 10) {
      return errorResponse('Maximum 10 tickers per batch', 400);
    }

    // Validate limit
    if (typeof limit !== 'number' || limit < 1 || limit > 50) {
      return errorResponse('Invalid limit. Must be between 1 and 50.', 400);
    }

    // Validate ticker format (allow dots and hyphens for tickers like BRK.A, BF-B)
    for (const ticker of tickers) {
      if (typeof ticker !== 'string' || !/^[A-Z0-9.-]+$/.test(ticker.toUpperCase())) {
        return errorResponse(`Invalid ticker format: ${ticker}. Must contain only letters, numbers, dots, and hyphens.`, 400);
      }
    }

    // Get API key
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      logError('BatchNewsHandler', new Error('FINNHUB_API_KEY not configured'), { requestId });
      return errorResponse('Server configuration error', 500);
    }

    // Calculate dates (last 7 days by default for news)
    const to = new Date().toISOString().split('T')[0];
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 7);
    const from = fromDate.toISOString().split('T')[0];

    // Process tickers in parallel
    const results = await Promise.allSettled(
      tickers.map(ticker => handleNewsWithCache(ticker.toUpperCase(), from, to, apiKey))
    );

    // Build response
    const response: BatchNewsResponse = {
      data: {},
      errors: {},
      _meta: {
        successCount: 0,
        errorCount: 0,
        cached: {},
        timestamp: new Date().toISOString(),
      },
    };

    results.forEach((result, idx) => {
      const ticker = tickers[idx].toUpperCase();
      if (result.status === 'fulfilled') {
        // Apply limit per ticker
        response.data[ticker] = result.value.data.slice(0, limit);
        response._meta.cached[ticker] = result.value.cached;
        response._meta.successCount++;
      } else {
        const errorMessage = result.reason instanceof Error ? result.reason.message : 'Unknown error';
        response.errors[ticker] = errorMessage;
        response._meta.errorCount++;
        logError('BatchNewsHandler', result.reason, { requestId, ticker });
      }
    });

    // Log metrics
    const duration = Date.now() - startTime;
    logMetrics(
      [
        { name: 'RequestDuration', value: duration, unit: MetricUnit.Milliseconds },
        { name: 'BatchSize', value: tickers.length, unit: MetricUnit.Count },
        { name: 'SuccessCount', value: response._meta.successCount, unit: MetricUnit.Count },
        { name: 'ErrorCount', value: response._meta.errorCount, unit: MetricUnit.Count },
      ],
      {
        Endpoint: 'batch/news',
      }
    );

    const { data, errors, _meta } = response;

    const apiResponse = successResponse(
      data,
      200,
      {
        errors,
        _meta
      }
    );

    apiResponse.headers['X-Batch-Limit'] = '10';

    return apiResponse;

  } catch (error) {
    logError('BatchNewsHandler', error, { requestId });
    return errorResponse('Internal server error', 500);
  }
}

/**
 * Handle batch sentiment request
 * Accepts multiple tickers and returns aggregated sentiment data
 */
export async function handleBatchSentimentRequest(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayResponse> {
  const requestId = event.requestContext.requestId;
  const startTime = Date.now();

  try {
    // Parse request body
    if (!event.body) {
      return errorResponse('Missing request body', 400);
    }

    let requestBody: BatchSentimentRequest;
    try {
      requestBody = JSON.parse(event.body);
    } catch (e) {
      return errorResponse('Invalid JSON body', 400);
    }

    const { tickers, startDate, endDate } = requestBody;

    // Validate tickers
    if (!tickers || !Array.isArray(tickers)) {
      return errorResponse('Missing or invalid "tickers" field. Must be an array of strings.', 400);
    }

    if (tickers.length === 0) {
      return errorResponse('Tickers array cannot be empty', 400);
    }

    // Rate limiting: Max 10 tickers per batch
    if (tickers.length > 10) {
      return errorResponse('Maximum 10 tickers per batch', 400);
    }

    // Validate ticker format
    for (const ticker of tickers) {
      if (typeof ticker !== 'string' || !/^[A-Z0-9.-]+$/.test(ticker.toUpperCase())) {
        return errorResponse(`Invalid ticker format: ${ticker}. Must contain only letters, numbers, dots, and hyphens.`, 400);
      }
    }

    // Validate dates
    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return errorResponse('Invalid startDate format. Must be YYYY-MM-DD.', 400);
    }

    if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return errorResponse('Invalid endDate format. Must be YYYY-MM-DD.', 400);
    }

    // Validate date range
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (start > end) {
        return errorResponse('Invalid date range. startDate must be before or equal to endDate.', 400);
      }
    }

    // Process tickers in parallel
    const results = await Promise.allSettled(
      tickers.map(async (ticker) => {
        const result = await getSentimentResults(
          ticker.toUpperCase(),
          startDate,
          endDate
        );

        return {
          data: result.dailySentiment,
          cached: result.cached
        };
      })
    );

    // Build response
    const response: BatchSentimentResponse = {
      data: {},
      errors: {},
      _meta: {
        successCount: 0,
        errorCount: 0,
        cached: {},
        timestamp: new Date().toISOString(),
      },
    };

    results.forEach((result, idx) => {
      const ticker = tickers[idx].toUpperCase();
      if (result.status === 'fulfilled') {
        response.data[ticker] = result.value.data;
        response._meta.cached[ticker] = result.value.cached;
        response._meta.successCount++;
      } else {
        const errorMessage = result.reason instanceof Error ? result.reason.message : 'Unknown error';
        response.errors[ticker] = errorMessage;
        response._meta.errorCount++;
        logError('BatchSentimentHandler', result.reason, { requestId, ticker });
      }
    });

    // Log metrics
    const duration = Date.now() - startTime;
    logMetrics(
      [
        { name: 'RequestDuration', value: duration, unit: MetricUnit.Milliseconds },
        { name: 'BatchSize', value: tickers.length, unit: MetricUnit.Count },
        { name: 'SuccessCount', value: response._meta.successCount, unit: MetricUnit.Count },
        { name: 'ErrorCount', value: response._meta.errorCount, unit: MetricUnit.Count },
      ],
      {
        Endpoint: 'batch/sentiment',
      }
    );

    const { data, errors, _meta } = response;

    const apiResponse = successResponse(
      data,
      200,
      {
        errors,
        _meta
      }
    );

    apiResponse.headers['X-Batch-Limit'] = '10';

    return apiResponse;

  } catch (error) {
    logError('BatchSentimentHandler', error, { requestId });
    return errorResponse('Internal server error', 500);
  }
}
