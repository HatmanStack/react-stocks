/**
 * AWS Lambda entry point for React Stocks backend
 * Routes requests to appropriate handlers
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

/**
 * Main Lambda handler function
 * @param event - API Gateway HTTP API event (v2 format)
 * @returns API Gateway response
 */
export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  console.log('[Lambda] Incoming request:', {
    path: event.rawPath,
    method: event.requestContext.http.method,
  });

  // Placeholder - will implement routing in Task 1.2
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      message: 'Backend placeholder - routing to be implemented',
      path: event.rawPath,
    }),
  };
}
