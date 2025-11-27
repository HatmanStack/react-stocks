/**
 * AWS Lambda entry point for React Stocks backend
 * Routes requests to appropriate handlers
 */

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { errorResponse, type APIGatewayResponse } from './utils/response.util';
import { logError, getStatusCodeFromError, getErrorMessage } from './utils/error.util';
import { logLambdaStartStatus } from './utils/metrics.util';

// Track cold start - only the first invocation is a cold start
let isFirstInvocation = true;

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

  // Cold Start Detection - only first invocation per container is cold
  const isColdStart = isFirstInvocation;
  isFirstInvocation = false;
  logLambdaStartStatus(isColdStart, path);

  console.log('[Lambda] Incoming request:', {
    requestId,
    path,
    method,
    isColdStart
  });

  try {
    // Route to appropriate handler based on path (wrap in blocks to prevent scope leakage)
    switch (path) {
      case '/stocks': {
        // GET only
        if (method !== 'GET') {
          return errorResponse(`Method ${method} not allowed for /stocks`, 405);
        }
        const { handleStocksRequest } = await import('./handlers/stocks.handler');
        return handleStocksRequest(event);
      }

      case '/news': {
        // GET only
        if (method !== 'GET') {
          return errorResponse(`Method ${method} not allowed for /news`, 405);
        }
        const { handleNewsRequest } = await import('./handlers/news.handler');
        return handleNewsRequest(event);
      }

      case '/search': {
        // GET only
        if (method !== 'GET') {
          return errorResponse(`Method ${method} not allowed for /search`, 405);
        }
        const { handleSearchRequest } = await import('./handlers/search.handler');
        return handleSearchRequest(event);
      }

      case '/sentiment': {
        // POST and GET supported
        if (method === 'POST') {
          const { handleSentimentRequest } = await import('./handlers/sentiment.handler');
          return handleSentimentRequest(event);
        } else if (method === 'GET') {
          const { handleSentimentResultsRequest } = await import('./handlers/sentiment.handler');
          return handleSentimentResultsRequest(event);
        } else {
          return errorResponse(`Method ${method} not allowed for /sentiment`, 405);
        }
      }

      case '/predict': {
        // POST only
        if (method !== 'POST') {
          return errorResponse(`Method ${method} not allowed for /predict`, 405);
        }
        const { predictionHandler } = await import('./handlers/prediction.handler');
        return predictionHandler(event);
      }

      case '/batch/stocks': {
        // POST only
        if (method !== 'POST') {
          return errorResponse(`Method ${method} not allowed for /batch/stocks`, 405);
        }
        const { handleBatchStocksRequest } = await import('./handlers/batch.handler');
        return handleBatchStocksRequest(event);
      }

      case '/batch/news': {
        // POST only
        if (method !== 'POST') {
          return errorResponse(`Method ${method} not allowed for /batch/news`, 405);
        }
        const { handleBatchNewsRequest } = await import('./handlers/batch.handler');
        return handleBatchNewsRequest(event);
      }

      case '/batch/sentiment': {
        // POST only
        if (method !== 'POST') {
          return errorResponse(`Method ${method} not allowed for /batch/sentiment`, 405);
        }
        const { handleBatchSentimentRequest } = await import('./handlers/batch.handler');
        return handleBatchSentimentRequest(event);
      }

      default: {
        // Check if it's a job status request (/sentiment/job/:jobId)
        if (path.startsWith('/sentiment/job/')) {
          if (method !== 'GET') {
            return errorResponse(`Method ${method} not allowed for /sentiment/job/:jobId`, 405);
          }
          const { handleSentimentJobStatusRequest } = await import('./handlers/sentiment.handler');
          return handleSentimentJobStatusRequest(event);
        }

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
