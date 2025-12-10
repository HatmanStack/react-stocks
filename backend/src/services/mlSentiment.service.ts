/**
 * MlSentiment Client Service
 *
 * Provides HTTP client for calling the MlSentiment sentiment analysis service.
 * Includes retry logic, error handling, and graceful fallback on failures.
 *
 * @see docs/plans/Phase-3.md for integration details
 */

/**
 * MlSentiment API configuration
 *
 * Note: API URL is read at runtime from process.env to support testing
 */
const TIMEOUT_MS = 5000; // 5 second timeout per request
const MAX_RETRIES = 3; // Retry up to 3 times
const INITIAL_RETRY_DELAY_MS = 1000; // Start with 1 second delay

/**
 * Get MlSentiment API URL from environment
 * @returns API URL or undefined if not configured
 */
function getApiUrl(): string | undefined {
  return process.env.ML_SENTIMENT_API_URL;
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
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

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
export async function getMlSentimentSentiment(
  text: string
): Promise<number | null> {
  // Validate configuration (read at runtime for testability)
  const apiUrl = getApiUrl();
  if (!apiUrl) {
    console.warn(
      '[MlSentimentService] ML_SENTIMENT_API_URL not configured, skipping MlSentiment analysis'
    );
    return null;
  }

  // Validate input
  if (!text || !text.trim()) {
    console.warn('[MlSentimentService] Empty text provided, skipping analysis');
    return null;
  }

  // Truncate very long texts (API has max length)
  const MAX_TEXT_LENGTH = 5000;
  let processedText = text;
  if (text.length > MAX_TEXT_LENGTH) {
    console.warn('[MlSentimentService] Text truncated', {
      originalLength: text.length,
      truncatedLength: MAX_TEXT_LENGTH,
    });
    processedText = text.substring(0, MAX_TEXT_LENGTH);
  }

  // Retry loop
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
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

      if (!response.ok) {
        const isLastAttempt = attempt === MAX_RETRIES;
        const canRetry = shouldRetry(null, response.status);

        console.error('[MlSentimentService] HTTP request failed', {
          attempt,
          isLastAttempt,
          canRetry,
          status: response.status,
          statusText: response.statusText,
        });

        if (isLastAttempt || !canRetry) {
          return null;
        }

        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        await sleep(delay);
        continue;
      }

      const data = await response.json() as MlSentimentResponse;

      // Validate response structure
      if (!data || typeof data.sentiment !== 'number') {
        console.error('[MlSentimentService] Invalid response format', { data });
        throw new Error('Invalid response format from MlSentiment API');
      }

      // Validate sentiment score range
      const sentimentScore = data.sentiment;
      if (sentimentScore < -1 || sentimentScore > 1) {
        console.error('[MlSentimentService] Sentiment score out of range', {
          score: sentimentScore,
        });
        throw new Error(`Invalid sentiment score: ${sentimentScore}`);
      }

      console.log('[MlSentimentService] Analysis successful', {
        sentiment: sentimentScore,
        label: data.label,
        confidence: data.confidence,
      });

      return sentimentScore;
    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES;
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
        return null;
      }

      const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
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
