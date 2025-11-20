/**
 * DistilFinBERT Client Service
 *
 * Provides HTTP client for calling the DistilFinBERT sentiment analysis service.
 * Includes retry logic, error handling, and graceful fallback on failures.
 *
 * @see docs/plans/Phase-3.md for integration details
 */

import axios, { AxiosError } from 'axios';

/**
 * DistilFinBERT API configuration
 */
const DISTILFINBERT_API_URL = process.env.DISTILFINBERT_API_URL;
const TIMEOUT_MS = 5000; // 5 second timeout per request
const MAX_RETRIES = 3; // Retry up to 3 times
const INITIAL_RETRY_DELAY_MS = 1000; // Start with 1 second delay

/**
 * DistilFinBERT API response structure
 */
interface DistilFinBERTResponse {
  sentiment: number; // -1 to +1
  confidence: number; // 0 to 1
  label: string; // 'positive' | 'negative' | 'neutral'
  probabilities: {
    negative: number;
    neutral: number;
    positive: number;
  };
}

/**
 * Get sentiment score from DistilFinBERT service
 *
 * Calls external DistilFinBERT API with retry logic and error handling.
 * Returns sentiment score from -1 (very negative) to +1 (very positive).
 *
 * **Retry Strategy:**
 * - Retries on network errors, timeouts, and 5xx server errors
 * - Exponential backoff: 1s, 2s, 4s between retries
 * - Does not retry on 4xx client errors (bad request)
 *
 * **Fallback:**
 * - Returns null on all errors to trigger bag-of-words fallback
 * - Logs detailed error information for debugging
 *
 * @param text - Financial news text to analyze
 * @returns Sentiment score -1 to +1, or null on error
 *
 * @example
 * const score = await getDistilFinBERTSentiment('Earnings beat expectations');
 * // Returns: 0.75 (positive sentiment)
 *
 * @example
 * const score = await getDistilFinBERTSentiment('Service unavailable text');
 * // Returns: null (service error, will use bag-of-words fallback)
 */
export async function getDistilFinBERTSentiment(
  text: string
): Promise<number | null> {
  // Validate configuration
  if (!DISTILFINBERT_API_URL) {
    console.warn(
      '[DistilFinBERTService] DISTILFINBERT_API_URL not configured, skipping DistilFinBERT analysis'
    );
    return null;
  }

  // Validate input
  if (!text || !text.trim()) {
    console.warn('[DistilFinBERTService] Empty text provided, skipping analysis');
    return null;
  }

  // Truncate very long texts (API has max length)
  const MAX_TEXT_LENGTH = 5000;
  if (text.length > MAX_TEXT_LENGTH) {
    console.warn('[DistilFinBERTService] Text truncated', {
      originalLength: text.length,
      truncatedLength: MAX_TEXT_LENGTH,
    });
    text = text.substring(0, MAX_TEXT_LENGTH);
  }

  // Retry loop
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log('[DistilFinBERTService] Calling DistilFinBERT API', {
        attempt,
        textLength: text.length,
        url: DISTILFINBERT_API_URL,
      });

      // Make HTTP request
      const response = await axios.post<DistilFinBERTResponse>(
        `${DISTILFINBERT_API_URL}/sentiment`,
        { text },
        {
          timeout: TIMEOUT_MS,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      // Validate response structure
      if (!response.data || typeof response.data.sentiment !== 'number') {
        console.error('[DistilFinBERTService] Invalid response format', {
          data: response.data,
        });
        throw new Error('Invalid response format from DistilFinBERT API');
      }

      // Validate sentiment score range
      const sentimentScore = response.data.sentiment;
      if (sentimentScore < -1 || sentimentScore > 1) {
        console.error('[DistilFinBERTService] Sentiment score out of range', {
          score: sentimentScore,
        });
        throw new Error(`Invalid sentiment score: ${sentimentScore}`);
      }

      // Success!
      console.log('[DistilFinBERTService] Analysis successful', {
        sentiment: sentimentScore,
        label: response.data.label,
        confidence: response.data.confidence,
      });

      return sentimentScore;
    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES;
      const shouldRetry = shouldRetryError(error);

      // Log error details
      if (error instanceof AxiosError) {
        console.error('[DistilFinBERTService] HTTP request failed', {
          attempt,
          isLastAttempt,
          shouldRetry,
          status: error.response?.status,
          statusText: error.response?.statusText,
          message: error.message,
          code: error.code,
        });
      } else {
        console.error('[DistilFinBERTService] Unexpected error', {
          attempt,
          isLastAttempt,
          shouldRetry,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // If last attempt or non-retryable error, return null (fallback)
      if (isLastAttempt || !shouldRetry) {
        console.warn(
          '[DistilFinBERTService] All retries exhausted or non-retryable error, using fallback',
          {
            totalAttempts: attempt,
          }
        );
        return null;
      }

      // Wait before retry (exponential backoff)
      const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      console.log('[DistilFinBERTService] Retrying after delay', {
        attempt,
        delayMs: delay,
      });

      await sleep(delay);
    }
  }

  // Should never reach here, but return null as fallback
  return null;
}

/**
 * Determine if an error is retryable
 *
 * Retryable errors:
 * - Network errors (no response)
 * - Timeouts (ECONNABORTED, ETIMEDOUT)
 * - 5xx server errors (service temporarily unavailable)
 *
 * Non-retryable errors:
 * - 4xx client errors (bad request, not found, etc.)
 * - Invalid response format (logic error, not transient)
 *
 * @param error - Error from axios request
 * @returns true if error is retryable, false otherwise
 */
function shouldRetryError(error: unknown): boolean {
  if (!(error instanceof AxiosError)) {
    // Unknown error type - don't retry
    return false;
  }

  // Network error (no response received)
  if (!error.response) {
    return true;
  }

  // Timeout errors
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return true;
  }

  // Server errors (5xx) - retry
  if (error.response.status >= 500) {
    return true;
  }

  // Client errors (4xx) - don't retry (won't succeed)
  if (error.response.status >= 400 && error.response.status < 500) {
    return false;
  }

  // Default: don't retry
  return false;
}

/**
 * Sleep utility for exponential backoff
 *
 * @param ms - Milliseconds to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get DistilFinBERT service health status
 *
 * Useful for monitoring and diagnostics.
 *
 * @returns Health status or null on error
 */
export async function getDistilFinBERTHealth(): Promise<{
  status: string;
  model_loaded: boolean;
} | null> {
  if (!DISTILFINBERT_API_URL) {
    return null;
  }

  try {
    const response = await axios.get(`${DISTILFINBERT_API_URL}/health`, {
      timeout: 3000,
    });

    return response.data;
  } catch (error) {
    console.error('[DistilFinBERTService] Health check failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
