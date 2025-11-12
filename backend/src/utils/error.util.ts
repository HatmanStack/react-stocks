/**
 * Error handling utilities
 * Custom error classes and logging helpers
 */

/**
 * Custom API error with HTTP status code
 */
export class APIError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Log error with context information
 * @param context - Context identifier (e.g., handler name)
 * @param error - Error object
 * @param additionalInfo - Additional context information
 */
export function logError(
  context: string,
  error: unknown,
  additionalInfo?: Record<string, unknown>
): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  console.error(`[${context}] Error:`, {
    message: errorMessage,
    stack: errorStack,
    ...additionalInfo,
  });
}

/**
 * Extract status code from error
 * @param error - Error object
 * @returns HTTP status code
 */
export function getStatusCodeFromError(error: unknown): number {
  if (error instanceof APIError) {
    return error.statusCode;
  }

  // Default to 500 for unknown errors
  return 500;
}

/**
 * Extract error message from unknown error
 * @param error - Error object
 * @returns Error message string
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
