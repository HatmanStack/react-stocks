/**
 * Search handler for Tiingo ticker search
 */

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { successResponse, errorResponse, type APIGatewayResponse } from '../utils/response.util';
import { logError } from '../utils/error.util';
import { searchTickers } from '../services/tiingo.service';

/**
 * Handle search requests (proxy to Tiingo Search API)
 * @param event - API Gateway event
 * @returns API Gateway response
 */
export async function handleSearchRequest(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayResponse> {
  const requestId = event.requestContext.requestId;

  try {
    // Parse query parameters
    const params = event.queryStringParameters || {};
    const query = params.query?.trim();

    // Validate required parameters
    if (!query) {
      return errorResponse('Missing required parameter: query', 400);
    }

    // Validate query length (minimum 1 character, maximum 100 characters)
    if (query.length < 1) {
      return errorResponse('Query must be at least 1 character', 400);
    }

    if (query.length > 100) {
      return errorResponse('Query must be less than 100 characters', 400);
    }

    // Get API key from environment
    const apiKey = process.env.TIINGO_API_KEY;
    if (!apiKey) {
      logError('SearchHandler', new Error('TIINGO_API_KEY not configured'), { requestId });
      return errorResponse('Server configuration error', 500);
    }

    // Search for tickers
    const results = await searchTickers(query, apiKey);

    return successResponse(results);
  } catch (error) {
    logError('SearchHandler', error, { requestId });

    // Extract error message and status
    const message = error instanceof Error ? error.message : 'Internal server error';
    const statusCode = (error as any).statusCode || 500;

    return errorResponse(message, statusCode);
  }
}
