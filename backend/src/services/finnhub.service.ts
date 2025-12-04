/**
 * Finnhub API Service
 * Fetches news from Finnhub API
 */

import type { FinnhubNewsArticle } from '../types/finnhub.types';
import { APIError } from '../utils/error.util';

// Finnhub API configuration
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
const FINNHUB_TIMEOUT = 10000; // 10 seconds

/**
 * Make a fetch request with timeout
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FINNHUB_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Retry logic with exponential backoff
 * @param fn - Function to retry
 * @param retries - Number of retries (default: 3)
 * @returns Promise with result
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries: number = 3
): Promise<T> {
  let lastError: Error | null = null;

  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry APIError instances with non-retryable status codes
      if (error instanceof APIError) {
        const status = error.statusCode;
        if (status && status >= 400 && status < 500 && status !== 429) {
          throw error;
        }
      }

      // Last attempt failed
      if (i === retries) {
        break;
      }

      // Exponential backoff: 2s, 4s, 8s
      const delay = Math.pow(2, i + 1) * 1000;
      console.log(`[FinnhubService] Retry ${i + 1}/${retries} after ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Request failed after retries');
}

/**
 * Fetch company news from Finnhub API
 * @param ticker - Stock ticker symbol
 * @param from - Start date in YYYY-MM-DD format
 * @param to - End date in YYYY-MM-DD format
 * @param apiKey - Finnhub API key
 * @returns Array of news articles
 * @throws APIError if API request fails
 */
export async function fetchCompanyNews(
  ticker: string,
  from: string,
  to: string,
  apiKey: string
): Promise<FinnhubNewsArticle[]> {
  const fetchFn = async () => {
    console.log(`[FinnhubService] Fetching news for ${ticker} from ${from} to ${to}`);

    const params = new URLSearchParams({
      symbol: ticker,
      from,
      to,
      token: apiKey,
    });
    const url = `${FINNHUB_BASE_URL}/company-news?${params}`;
    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      const status = response.status;

      if (status === 404) {
        console.log(`[FinnhubService] No news found for ${ticker}`);
        return [];
      }

      if (status === 429) {
        throw new APIError('Rate limit exceeded. Please try again in a moment.', 429);
      }

      if (status === 401 || status === 403) {
        throw new APIError('Invalid API key. Please check your Finnhub API key.', 401);
      }

      throw new APIError(`Failed to fetch news for ${ticker}`, status);
    }

    const data = await response.json() as FinnhubNewsArticle[];
    console.log(`[FinnhubService] Fetched ${data.length} news articles for ${ticker}`);
    return data;
  };

  return retryWithBackoff(fetchFn);
}
