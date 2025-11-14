/**
 * Tiingo API Service
 * Fetches stock prices and company metadata from Lambda backend
 * Backend proxies requests to Tiingo API (API keys secured in Lambda)
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import type { TiingoStockPrice, TiingoSymbolMetadata, TiingoSearchResult } from './tiingo.types';
import type { StockDetails, SymbolDetails } from '@/types/database.types';
import { Environment } from '@/config/environment';

// Backend API configuration
const BACKEND_TIMEOUT = 30000; // 30 seconds (Lambda handles retries)

/**
 * Create axios instance for backend API
 */
function createBackendClient(): AxiosInstance {
  if (!Environment.BACKEND_URL) {
    throw new Error(
      'Backend URL not configured. Set EXPO_PUBLIC_BACKEND_URL in .env file.'
    );
  }

  return axios.create({
    baseURL: Environment.BACKEND_URL,
    timeout: BACKEND_TIMEOUT,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Retry logic with exponential backoff
 * @param fn - Function to retry
 * @param retries - Number of retries (default: 3, 0 in test mode)
 * @returns Promise with result
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries: number = process.env.NODE_ENV === 'test' ? 0 : 3
): Promise<T> {
  let lastError: Error | null = null;

  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on client errors (400, 404, etc.)
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
 * Fetch stock prices from Lambda backend (proxies to Tiingo API)
 * @param ticker - Stock ticker symbol (e.g., "AAPL")
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format (optional, defaults to today)
 * @returns Array of stock price data
 * @throws Error if ticker not found or API request fails
 */
export async function fetchStockPrices(
  ticker: string,
  startDate: string,
  endDate?: string
): Promise<TiingoStockPrice[]> {
  const client = createBackendClient();

  const fetchFn = async () => {
    try {
      const params: Record<string, string> = {
        ticker,
        startDate,
        type: 'prices',
      };

      if (endDate) {
        params.endDate = endDate;
      }

      console.log(`[TiingoService] Fetching prices for ${ticker} from ${startDate} to ${endDate || 'today'}`);

      const response = await client.get<{ data: TiingoStockPrice[] }>(
        '/stocks',
        { params }
      );

      console.log(`[TiingoService] Fetched ${response.data.data.length} price records for ${ticker}`);
      return response.data.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const errorData = error.response?.data as { error?: string };

        if (status === 404) {
          throw new Error(`Ticker '${ticker}' not found`);
        }

        if (status === 429) {
          throw new Error('Rate limit exceeded. Please try again in a moment.');
        }

        if (status === 400) {
          throw new Error(errorData?.error || 'Invalid request parameters');
        }

        if (status === 500) {
          throw new Error(errorData?.error || 'Backend service error');
        }
      }

      console.error('[TiingoService] Error fetching stock prices:', error);
      throw new Error(`Failed to fetch stock prices for ${ticker}: ${error}`);
    }
  };

  return retryWithBackoff(fetchFn);
}

/**
 * Fetch company metadata from Lambda backend (proxies to Tiingo API)
 * @param ticker - Stock ticker symbol (e.g., "AAPL")
 * @returns Company metadata
 * @throws Error if ticker not found or API request fails
 */
export async function fetchSymbolMetadata(
  ticker: string
): Promise<TiingoSymbolMetadata> {
  const client = createBackendClient();

  const fetchFn = async () => {
    try {
      console.log(`[TiingoService] Fetching metadata for ${ticker}`);

      const response = await client.get<{ data: TiingoSymbolMetadata }>(
        '/stocks',
        {
          params: { ticker, type: 'metadata' },
        }
      );

      console.log(`[TiingoService] Fetched metadata for ${ticker}: ${response.data.data.name}`);
      return response.data.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const errorData = error.response?.data as { error?: string };

        if (status === 404) {
          throw new Error(`Ticker '${ticker}' not found`);
        }

        if (status === 429) {
          throw new Error('Rate limit exceeded. Please try again in a moment.');
        }

        if (status === 400) {
          throw new Error(errorData?.error || 'Invalid request parameters');
        }

        if (status === 500) {
          throw new Error(errorData?.error || 'Backend service error');
        }
      }

      console.error('[TiingoService] Error fetching symbol metadata:', error);
      throw new Error(`Failed to fetch metadata for ${ticker}: ${error}`);
    }
  };

  return retryWithBackoff(fetchFn);
}

/**
 * Transform Tiingo API response to StockDetails database format
 * @param price - Tiingo stock price data
 * @param ticker - Stock ticker symbol
 * @returns StockDetails object ready for database insertion
 */
export function transformTiingoToStockDetails(
  price: TiingoStockPrice,
  ticker: string
): StockDetails {
  // Extract date (first 10 characters: YYYY-MM-DD)
  const date = price.date.substring(0, 10);

  // Round prices to 2 decimal places (matching Android logic)
  const round = (num: number) => Math.round(num * 100) / 100;

  return {
    ticker,
    date,
    close: round(price.close),
    high: round(price.high),
    low: round(price.low),
    open: round(price.open),
    volume: price.volume,
    adjClose: round(price.adjClose),
    adjHigh: round(price.adjHigh),
    adjLow: round(price.adjLow),
    adjOpen: round(price.adjOpen),
    adjVolume: price.adjVolume,
    divCash: price.divCash,
    splitFactor: price.splitFactor,
    // Additional fields (set to default values for now)
    hash: 0,
    marketCap: 0,
    enterpriseVal: 0,
    peRatio: 0,
    pbRatio: 0,
    trailingPEG1Y: 0,
  };
}

/**
 * Transform Tiingo symbol metadata to SymbolDetails database format
 * @param metadata - Tiingo symbol metadata
 * @returns SymbolDetails object ready for database insertion
 */
export function transformTiingoToSymbolDetails(
  metadata: TiingoSymbolMetadata
): SymbolDetails {
  return {
    ticker: metadata.ticker,
    name: metadata.name,
    exchangeCode: metadata.exchangeCode,
    startDate: metadata.startDate,
    endDate: metadata.endDate,
    longDescription: metadata.description,
  };
}

/**
 * Search for stock tickers by ticker symbol or company name
 * @param query - Search query (ticker or company name, e.g., "tesla" or "TSLA")
 * @returns Array of matching ticker symbols
 * @throws Error if API request fails
 */
export async function searchTickers(query: string): Promise<TiingoSearchResult[]> {
  const client = createBackendClient();

  const fetchFn = async () => {
    try {
      const trimmedQuery = query.trim();

      if (!trimmedQuery) {
        return [];
      }

      console.log(`[TiingoService] Searching for: ${trimmedQuery}`);

      const response = await client.get<{ data: TiingoSearchResult[] }>(
        '/search',
        {
          params: { query: trimmedQuery },
        }
      );

      console.log(`[TiingoService] Found ${response.data.data.length} results for query: ${trimmedQuery}`);
      return response.data.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const errorData = error.response?.data as { error?: string };

        if (status === 404) {
          // No results found
          console.log(`[TiingoService] No results found for query: ${query}`);
          return [];
        }

        if (status === 429) {
          throw new Error('Rate limit exceeded. Please try again in a moment.');
        }

        if (status === 400) {
          throw new Error(errorData?.error || 'Invalid search query');
        }

        if (status === 500) {
          throw new Error(errorData?.error || 'Backend service error');
        }
      }

      console.error('[TiingoService] Error searching tickers:', error);
      throw new Error(`Failed to search for tickers: ${error}`);
    }
  };

  return retryWithBackoff(fetchFn);
}
