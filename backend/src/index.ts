/**
 * AWS Lambda entry point for React Stocks backend
 * Routes requests to appropriate handlers
 */

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { errorResponse, type APIGatewayResponse } from './utils/response.util';
import { logError, getStatusCodeFromError, getErrorMessage } from './utils/error.util';

/**
 * Main Lambda handler function
 * Routes requests to appropriate sub-handlers based on path
 * @param event - API Gateway HTTP API event (v2 format)
 * @returns API Gateway response
 */
export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayResponse> {
  const requestId = event.requestContext.requestId;
  const path = event.rawPath;
  const method = event.requestContext.http.method;

  console.log('[Lambda] Incoming request:', {
    requestId,
    path,
    method,
  });

  try {
    // Validate HTTP method - only GET is supported
    if (method !== 'GET') {
      return errorResponse(`Method ${method} not allowed`, 405);
    }

    // Route to appropriate handler based on path (wrap in blocks to prevent scope leakage)
    switch (path) {
      case '/stocks': {
        const { handleStocksRequest } = await import('./handlers/stocks.handler');
        return handleStocksRequest(event);
      }

      case '/news': {
        const { handleNewsRequest } = await import('./handlers/news.handler');
        return handleNewsRequest(event);
      }

      case '/search': {
        const { handleSearchRequest } = await import('./handlers/search.handler');
        return handleSearchRequest(event);
      }

      default: {
        console.warn('[Lambda] Unknown route:', path);
        return errorResponse(`Route ${path} not found`, 404);
      }
    }
  } catch (error) {
    logError('Lambda', error, { requestId, path, method });

    const statusCode = getStatusCodeFromError(error);
    const message = getErrorMessage(error);

    return errorResponse(message, statusCode);
  }
}

// Export handler as default for Lambda
export default handler;
