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

/**
 * Custom API error class with HTTP status code
 */
export class APIError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
  }
}
