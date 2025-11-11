/**
 * News handler for Polygon API proxy
 */

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { successResponse, errorResponse, type APIGatewayResponse } from '../utils/response.util';
import { logError } from '../utils/error.util';
import { fetchNews } from '../services/polygon.service';

/**
 * Handle news requests (proxy to Polygon API)
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
    const startDate = params.startDate;
    const endDate = params.endDate;
    const limitParam = params.limit;

    // Validate required parameters
    if (!ticker) {
      return errorResponse('Missing required parameter: ticker', 400);
    }

    // Validate ticker format (alphanumeric)
    if (!/^[A-Z0-9]+$/.test(ticker)) {
      return errorResponse('Invalid ticker format. Must be alphanumeric.', 400);
    }

    // Validate dates if provided
    if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return errorResponse('Invalid startDate format. Must be YYYY-MM-DD.', 400);
    }

    if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return errorResponse('Invalid endDate format. Must be YYYY-MM-DD.', 400);
    }

    // Parse and validate limit
    let limit = 100; // Default
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        return errorResponse('Invalid limit. Must be a positive number.', 400);
      }
      // Cap at 1000 to prevent abuse
      limit = Math.min(parsedLimit, 1000);
    }

    // Get API key from environment
    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
      logError('NewsHandler', new Error('POLYGON_API_KEY not configured'), { requestId });
      return errorResponse('Server configuration error', 500);
    }

    // Fetch news
    const data = await fetchNews(ticker, startDate, endDate, limit, apiKey);

    return successResponse(data);
  } catch (error) {
    logError('NewsHandler', error, { requestId });

    // Extract error message and status
    const message = error instanceof Error ? error.message : 'Internal server error';
    const statusCode = (error as any).statusCode || 500;

    return errorResponse(message, statusCode);
  }
}
