/**
 * Stocks handler for Tiingo API proxy
 */

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { successResponse, errorResponse, type APIGatewayResponse } from '../utils/response.util';
import { logError } from '../utils/error.util';
import { fetchStockPrices, fetchSymbolMetadata } from '../services/tiingo.service';

/**
 * Handle stocks requests (proxy to Tiingo API)
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
    // Normalize to uppercase for validation
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
    let data;
    if (type === 'metadata') {
      data = await fetchSymbolMetadata(ticker, apiKey);
    } else {
      // Type is 'prices'
      if (!startDate) {
        return errorResponse('Missing required parameter for prices: startDate', 400);
      }
      data = await fetchStockPrices(ticker, startDate, endDate, apiKey);
    }

    return successResponse(data);
  } catch (error) {
    logError('StocksHandler', error, { requestId });

    // Extract error message and status
    const message = error instanceof Error ? error.message : 'Internal server error';
    const statusCode = (error as any).statusCode || 500;

    return errorResponse(message, statusCode);
  }
}
