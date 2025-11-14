/**
 * News handler for Finnhub API proxy
 */

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { successResponse, errorResponse, type APIGatewayResponse } from '../utils/response.util';
import { logError } from '../utils/error.util';
import { fetchCompanyNews } from '../services/finnhub.service';

/**
 * Handle news requests (proxy to Finnhub API)
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

    // Fetch news from Finnhub
    const data = await fetchCompanyNews(ticker, from, to, apiKey);

    return successResponse(data);
  } catch (error) {
    logError('NewsHandler', error, { requestId });

    // Extract error message and status
    const message = error instanceof Error ? error.message : 'Internal server error';
    const statusCode = (error as any).statusCode || 500;

    return errorResponse(message, statusCode);
  }
}
