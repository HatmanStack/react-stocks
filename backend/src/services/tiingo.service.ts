/**
 * Tiingo API Service
 * Fetches stock prices and company metadata from Tiingo API
 */

import type { TiingoStockPrice, TiingoSymbolMetadata, TiingoSearchResult, TiingoNewsArticle } from '../types/tiingo.types';
import { APIError } from '../utils/error.util';

// Tiingo API configuration
const TIINGO_BASE_URL = 'https://api.tiingo.com';
const TIINGO_TIMEOUT = 10000; // 10 seconds

/**
 * Make a fetch request with timeout
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIINGO_TIMEOUT);

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
      console.log(`[TiingoService] Retry ${i + 1}/${retries} after ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Handle HTTP response errors
 */
function handleResponseError(status: number, ticker: string): never {
  if (status === 404) {
    throw new APIError(`Ticker '${ticker}' not found`, 404);
  }
  if (status === 429) {
    throw new APIError('Rate limit exceeded. Please try again in a moment.', 429);
  }
  if (status === 401) {
    throw new APIError('Invalid API key. Please check your Tiingo API key.', 401);
  }
  throw new APIError(`API request failed with status ${status}`, status);
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
  const fetchFn = async () => {
    const params = new URLSearchParams({
      startDate,
      token: apiKey,
    });

    if (endDate) {
      params.set('endDate', endDate);
    }

    console.log(`[TiingoService] Fetching prices for ${ticker} from ${startDate} to ${endDate || 'today'}`);

    const url = `${TIINGO_BASE_URL}/tiingo/daily/${ticker}/prices?${params}`;
    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      handleResponseError(response.status, ticker);
    }

    const data = await response.json() as TiingoStockPrice[];
    console.log(`[TiingoService] Fetched ${data.length} price records for ${ticker}`);
    return data;
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
  const fetchFn = async () => {
    console.log(`[TiingoService] Fetching metadata for ${ticker}`);

    const params = new URLSearchParams({ token: apiKey });
    const url = `${TIINGO_BASE_URL}/tiingo/daily/${ticker}?${params}`;
    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      handleResponseError(response.status, ticker);
    }

    const data = await response.json() as TiingoSymbolMetadata;
    console.log(`[TiingoService] Fetched metadata for ${ticker}: ${data.name}`);
    return data;
  };

  return retryWithBackoff(fetchFn);
}

/**
 * Search for stock tickers by ticker symbol or company name
 * @param query - Search query (ticker or company name)
 * @param apiKey - Tiingo API key
 * @returns Array of matching ticker symbols
 * @throws APIError if API request fails
 */
export async function searchTickers(
  query: string,
  apiKey: string
): Promise<TiingoSearchResult[]> {
  const fetchFn = async () => {
    console.log(`[TiingoService] Searching for: ${query}`);

    const params = new URLSearchParams({
      query: query.trim(),
      token: apiKey,
    });
    const url = `${TIINGO_BASE_URL}/tiingo/utilities/search?${params}`;
    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[TiingoService] No results found for query: ${query}`);
        return [];
      }
      handleResponseError(response.status, query);
    }

    const data = await response.json() as TiingoSearchResult[];
    console.log(`[TiingoService] Found ${data.length} results for query: ${query}`);
    return data;
  };

  return retryWithBackoff(fetchFn);
}

/**
 * Fetch news articles for a ticker
 * @param ticker - Stock ticker symbol
 * @param limit - Maximum number of articles to return (default: 100)
 * @param apiKey - Tiingo API key
 * @returns Array of news articles
 * @throws APIError if API request fails
 */
export async function fetchNews(
  ticker: string,
  limit: number = 100,
  apiKey: string
): Promise<TiingoNewsArticle[]> {
  const fetchFn = async () => {
    console.log(`[TiingoService] Fetching news for ${ticker}, limit: ${limit}`);

    const params = new URLSearchParams({
      tickers: ticker,
      limit: String(Math.min(limit, 1000)),
      token: apiKey,
    });
    const url = `${TIINGO_BASE_URL}/tiingo/news?${params}`;
    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[TiingoService] No news found for ${ticker}`);
        return [];
      }
      handleResponseError(response.status, ticker);
    }

    const data = await response.json() as TiingoNewsArticle[];
    console.log(`[TiingoService] Fetched ${data.length} news articles for ${ticker}`);
    return data;
  };

  return retryWithBackoff(fetchFn);
}
