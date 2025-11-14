/**
 * Finnhub API Service
 * Fetches news from Finnhub API
 */

import axios, { AxiosInstance } from 'axios';
import type { FinnhubNewsArticle } from '../types/finnhub.types';
import { APIError } from '../utils/error.util';

// Finnhub API configuration
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
const FINNHUB_TIMEOUT = 10000; // 10 seconds

/**
 * Create axios instance for Finnhub API
 */
function createFinnhubClient(): AxiosInstance {
  return axios.create({
    baseURL: FINNHUB_BASE_URL,
    timeout: FINNHUB_TIMEOUT,
    headers: {
      'Content-Type': 'application/json',
    },
  });
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

      // Don't retry on client errors (400-499, except 429)
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status && status >= 400 && status < 500 && status !== 429) {
          throw error;
        }
      }

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

  throw lastError;
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
  const client = createFinnhubClient();

  const fetchFn = async () => {
    try {
      console.log(`[FinnhubService] Fetching news for ${ticker} from ${from} to ${to}`);

      const response = await client.get<FinnhubNewsArticle[]>(
        '/company-news',
        {
          params: {
            symbol: ticker,
            from,
            to,
            token: apiKey
          },
        }
      );

      console.log(`[FinnhubService] Fetched ${response.data.length} news articles for ${ticker}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;

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
      }

      console.error('[FinnhubService] Error fetching news:', error);
      throw new APIError(`Failed to fetch news for ${ticker}`, 500);
    }
  };

  return retryWithBackoff(fetchFn);
}
