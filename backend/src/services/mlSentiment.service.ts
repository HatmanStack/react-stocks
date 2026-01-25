/**
 * MlSentiment Client Service
 *
 * Provides HTTP client for calling the MlSentiment sentiment analysis service.
 * Includes retry logic, error handling, and graceful fallback on failures.
 *

 */

import { logMlSentimentCall, logMlSentimentFallback } from '../utils/metrics.util.js';
import {
  ML_TIMEOUT_MS,
  ML_MAX_RETRIES,
  ML_INITIAL_RETRY_DELAY_MS,
  ML_MAX_TEXT_LENGTH,
  CIRCUIT_FAILURE_THRESHOLD,
  CIRCUIT_COOLDOWN_MS,
} from '../constants/ml.constants.js';

/**
 * MlSentiment API configuration
 *
 * Note: API URL is read at runtime from process.env to support testing
 * Constants imported from ml.constants.ts with full derivation documentation.
 */

// Circuit breaker state (persists across warm Lambda invocations, resets on cold start)
let consecutiveFailures = 0;
let circuitOpenUntil = 0;

function isCircuitOpen(): boolean {
  if (consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
    if (Date.now() < circuitOpenUntil) return true;
    // Half-open: allow one probe request
    consecutiveFailures = CIRCUIT_FAILURE_THRESHOLD - 1;
  }
  return false;
}

function recordSuccess(): void {
  consecutiveFailures = 0;
}

function recordFailure(): void {
  consecutiveFailures++;
  if (consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
    console.warn(`[MlSentimentService] Circuit OPEN after ${CIRCUIT_FAILURE_THRESHOLD} failures, cooldown ${CIRCUIT_COOLDOWN_MS}ms`);
  }
}

/**
 * Get MlSentiment API URL from environment
 * @returns API URL or undefined if not configured
 */
function getApiUrl(): string | undefined {
  // Support both old and new env var names for backward compatibility
  return process.env.ML_SENTIMENT_API_URL || process.env.DISTILFINBERT_API_URL;
}

/**
 * MlSentiment API response structure
 */
interface MlSentimentResponse {
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
 * Make a fetch request with timeout
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ML_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Determine if an error/response is retryable
 */
function shouldRetry(error: unknown, status?: number): boolean {
  // Abort/timeout errors - retry
  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }

  // Network errors - retry
  if (error instanceof TypeError) {
    return true;
  }

  // Server errors (5xx) - retry
  if (status && status >= 500) {
    return true;
  }

  // Client errors (4xx) - don't retry
  if (status && status >= 400 && status < 500) {
    return false;
  }

  return false;
}

/**
 * Sleep utility for exponential backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get sentiment score from MlSentiment service
 *
 * Calls external MlSentiment API with retry logic and error handling.
 * Returns sentiment score from -1 (very negative) to +1 (very positive).
 *
 * @param text - Financial news text to analyze
 * @returns Sentiment score -1 to +1, or null on error
 */
export async function getMlSentiment(
  text: string
): Promise<number | null> {
  // Validate configuration (read at runtime for testability)
  const apiUrl = getApiUrl();
  if (!apiUrl) {
    console.warn(
      '[MlSentimentService] ML_SENTIMENT_API_URL/DISTILFINBERT_API_URL not configured, skipping ML analysis'
    );
    return null;
  }

  // Circuit breaker: fail-fast if service is down
  if (isCircuitOpen()) {
    console.warn('[MlSentimentService] Circuit open, skipping ML analysis');
    return null;
  }

  // Validate input
  if (!text || !text.trim()) {
    console.warn('[MlSentimentService] Empty text provided, skipping analysis');
    return null;
  }

  // Truncate very long texts (API has max length)
  let processedText = text;
  if (text.length > ML_MAX_TEXT_LENGTH) {
    console.warn('[MlSentimentService] Text truncated', {
      originalLength: text.length,
      truncatedLength: ML_MAX_TEXT_LENGTH,
    });
    processedText = text.substring(0, ML_MAX_TEXT_LENGTH);
  }

  // Retry loop
  for (let attempt = 1; attempt <= ML_MAX_RETRIES; attempt++) {
    const startTime = Date.now();
    try {
      console.log('[MlSentimentService] Calling MlSentiment API', {
        attempt,
        textLength: processedText.length,
        url: apiUrl,
      });

      const response = await fetchWithTimeout(`${apiUrl}/sentiment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: processedText }),
      });

      const duration = Date.now() - startTime;

      if (!response.ok) {
        logMlSentimentCall('UNKNOWN', duration, false, false); // Ticker not available here, use UNKNOWN
        const isLastAttempt = attempt === ML_MAX_RETRIES;
        const canRetry = shouldRetry(null, response.status);

        console.error('[MlSentimentService] HTTP request failed', {
          attempt,
          isLastAttempt,
          canRetry,
          status: response.status,
          statusText: response.statusText,
        });

        if (isLastAttempt || !canRetry) {
          recordFailure();
          return null;
        }

        const delay = ML_INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        await sleep(delay);
        continue;
      }

      logMlSentimentCall('UNKNOWN', duration, true, false); // Success, no cache hit here

      const data = await response.json() as MlSentimentResponse;

      // Validate response structure
      if (!data || typeof data.sentiment !== 'number') {
        console.error('[MlSentimentService] Invalid response format', { data });
        throw new Error('Invalid response format from MlSentiment API');
      }

      // Validate sentiment score range
      const rawScore = data.sentiment;
      if (rawScore < -1 || rawScore > 1) {
        console.error('[MlSentimentService] Sentiment score out of range', {
          score: rawScore,
        });
        throw new Error(`Invalid sentiment score: ${rawScore}`);
      }

      console.log('[MlSentimentService] Analysis successful', {
        score: rawScore,
        label: data.label,
      });

      recordSuccess();
      return rawScore;
    } catch (error) {
      const duration = Date.now() - startTime;
      logMlSentimentCall('UNKNOWN', duration, false, false);

      const isLastAttempt = attempt === ML_MAX_RETRIES;
      const canRetry = shouldRetry(error);

      console.error('[MlSentimentService] Request error', {
        attempt,
        isLastAttempt,
        canRetry,
        error: error instanceof Error ? error.message : String(error),
      });

      if (isLastAttempt || !canRetry) {
        console.warn(
          '[MlSentimentService] All retries exhausted or non-retryable error, using fallback'
        );
        recordFailure();
        logMlSentimentFallback('UNKNOWN', 1, 1, error instanceof Error ? error.message : 'Unknown error');
        return null;
      }

      const delay = ML_INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      console.log('[MlSentimentService] Retrying after delay', {
        attempt,
        delayMs: delay,
      });

      await sleep(delay);
    }
  }

  return null;
}

/**
 * Get MlSentiment service health status
 */
export async function getMlSentimentHealth(): Promise<{
  status: string;
  model_loaded: boolean;
} | null> {
  const apiUrl = getApiUrl();
  if (!apiUrl) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${apiUrl}/health`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    return await response.json() as { status: string; model_loaded: boolean };
  } catch (error) {
    console.error('[MlSentimentService] Health check failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
