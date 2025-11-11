/**
 * Tiingo API Service
 * Fetches stock prices and company metadata from Tiingo API
 */

import axios, { AxiosInstance } from 'axios';
import type { TiingoStockPrice, TiingoSymbolMetadata } from '../types/tiingo.types';
import { APIError } from '../utils/error.util';

// Tiingo API configuration
const TIINGO_BASE_URL = 'https://api.tiingo.com';
const TIINGO_TIMEOUT = 10000; // 10 seconds

/**
 * Create axios instance for Tiingo API
 */
function createTiingoClient(): AxiosInstance {
  return axios.create({
    baseURL: TIINGO_BASE_URL,
    timeout: TIINGO_TIMEOUT,
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

      // Last attempt failed
      if (i === retries) {
        break;
      }

      // Exponential backoff: 2s, 4s, 8s
      const delay = Math.pow(2, i + 1) * 1000;
      console.log(`[TiingoService] Retry ${i + 1}/${retries} after ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Fetch stock prices from Tiingo API
 * @param ticker - Stock ticker symbol (e.g., "AAPL")
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format (optional)
 * @param apiKey - Tiingo API key
 * @returns Array of stock price data
 * @throws APIError if ticker not found or API request fails
 */
export async function fetchStockPrices(
  ticker: string,
  startDate: string,
  endDate: string | undefined,
  apiKey: string
): Promise<TiingoStockPrice[]> {
  const client = createTiingoClient();

  const fetchFn = async () => {
    try {
      const params: Record<string, string> = {
        startDate,
        token: apiKey,
      };

      if (endDate) {
        params.endDate = endDate;
      }

      console.log(`[TiingoService] Fetching prices for ${ticker} from ${startDate} to ${endDate || 'today'}`);

      const response = await client.get<TiingoStockPrice[]>(
        `/tiingo/daily/${ticker}/prices`,
        { params }
      );

      console.log(`[TiingoService] Fetched ${response.data.length} price records for ${ticker}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;

        if (status === 404) {
          throw new APIError(`Ticker '${ticker}' not found`, 404);
        }

        if (status === 429) {
          throw new APIError('Rate limit exceeded. Please try again in a moment.', 429);
        }

        if (status === 401) {
          throw new APIError('Invalid API key. Please check your Tiingo API key.', 401);
        }
      }

      console.error('[TiingoService] Error fetching stock prices:', error);
      throw new APIError(`Failed to fetch stock prices for ${ticker}`, 500);
    }
  };

  return retryWithBackoff(fetchFn);
}

/**
 * Fetch company metadata from Tiingo API
 * @param ticker - Stock ticker symbol (e.g., "AAPL")
 * @param apiKey - Tiingo API key
 * @returns Company metadata
 * @throws APIError if ticker not found or API request fails
 */
export async function fetchSymbolMetadata(
  ticker: string,
  apiKey: string
): Promise<TiingoSymbolMetadata> {
  const client = createTiingoClient();

  const fetchFn = async () => {
    try {
      console.log(`[TiingoService] Fetching metadata for ${ticker}`);

      const response = await client.get<TiingoSymbolMetadata>(
        `/tiingo/daily/${ticker}`,
        {
          params: { token: apiKey },
        }
      );

      console.log(`[TiingoService] Fetched metadata for ${ticker}: ${response.data.name}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;

        if (status === 404) {
          throw new APIError(`Ticker '${ticker}' not found`, 404);
        }

        if (status === 429) {
          throw new APIError('Rate limit exceeded. Please try again in a moment.', 429);
        }

        if (status === 401) {
          throw new APIError('Invalid API key. Please check your Tiingo API key.', 401);
        }
      }

      console.error('[TiingoService] Error fetching symbol metadata:', error);
      throw new APIError(`Failed to fetch metadata for ${ticker}`, 500);
    }
  };

  return retryWithBackoff(fetchFn);
}
