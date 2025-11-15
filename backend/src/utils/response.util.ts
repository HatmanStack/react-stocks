/**
 * API Gateway response utilities
 * Helpers for creating consistent Lambda responses with CORS headers
 */

/**
 * API Gateway response structure
 */
export interface APIGatewayResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * CORS headers for all responses
 *
 * TODO: BEFORE PRODUCTION - Replace hardcoded '*' with environment variable
 * Current: Allows all origins (acceptable for MVP/development)
 * Production: Should restrict to specific domains via ALLOWED_ORIGINS env var
 * Example: process.env.ALLOWED_ORIGINS || '*'
 */
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*', // TODO: Restrict in production
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * Create a successful API response
 * @param data - Response data to return
 * @param statusCode - HTTP status code (default: 200)
 * @param meta - Optional metadata to include at top level (e.g., { _meta: {...} })
 * @returns API Gateway response object
 */
export function successResponse<T>(
  data: T,
  statusCode: number = 200,
  meta?: Record<string, any>
): APIGatewayResponse {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(meta ? { data, ...meta } : { data }),
  };
}

/**
 * Create an error API response
 * @param message - Error message
 * @param statusCode - HTTP status code (default: 500)
 * @returns API Gateway response object
 */
export function errorResponse(
  message: string,
  statusCode: number = 500
): APIGatewayResponse {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: message }),
  };
}

/**
 * Get CORS headers
 * @returns CORS headers object
 */
export function getCorsHeaders(): Record<string, string> {
  return { ...CORS_HEADERS };
}
