/**
 * Shared TypeScript type definitions for backend API
 */

/**
 * Standard API error response
 */
export interface APIErrorResponse {
  error: string;
  statusCode?: number;
}

/**
 * Standard API success response wrapper
 */
export interface APISuccessResponse<T = unknown> {
  data: T;
}

// Note: APIError class moved to utils/error.util.ts
