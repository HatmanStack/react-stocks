/**
 * Polygon.io API Service
 * Fetches news articles from Lambda backend
 * Backend proxies requests to Polygon.io API (API keys secured in Lambda)
 */

import axios, { AxiosInstance } from 'axios';
import { createHash } from 'crypto';
import type { PolygonNewsArticle } from './polygon.types';
import type { NewsDetails } from '@/types/database.types';
import { Environment } from '@/config/environment';

// Backend API configuration
const BACKEND_TIMEOUT = 30000; // 30 seconds (Lambda handles pagination and retries)

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
 * Generate MD5 hash for URL (used for deduplication)
 * @param url - Article URL
 * @returns MD5 hash string
 */
export function generateArticleHash(url: string): string {
  return createHash('md5').update(url).digest('hex');
}

/**
 * Fetch news articles from Lambda backend (proxies to Polygon API)
 * Backend handles pagination and aggregates all results
 * @param ticker - Stock ticker symbol (e.g., "AAPL")
 * @param startDate - Start date in YYYY-MM-DD format (optional)
 * @param endDate - End date in YYYY-MM-DD format (optional)
 * @param limit - Maximum number of articles to fetch (default: 100)
 * @returns Array of news articles
 * @throws Error if API request fails
 */
export async function fetchNews(
  ticker: string,
  startDate?: string,
  endDate?: string,
  limit: number = 100
): Promise<PolygonNewsArticle[]> {
  const client = createBackendClient();

  try {
    console.log(`[PolygonService] Fetching news for ${ticker}`);

    const params: Record<string, string | number> = {
      ticker,
      limit,
    };

    // Add date filters if provided
    if (startDate) {
      params.startDate = startDate;
    }
    if (endDate) {
      params.endDate = endDate;
    }

    const response = await client.get<{ data: PolygonNewsArticle[] }>('/news', { params });

    console.log(`[PolygonService] Fetched ${response.data.data.length} articles for ${ticker}`);
    return response.data.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const errorData = error.response?.data as { error?: string };

      if (status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }

      if (status === 404) {
        console.warn(`[PolygonService] No news found for ticker ${ticker}`);
        return []; // Return empty array instead of error
      }

      if (status === 400) {
        throw new Error(errorData?.error || 'Invalid request parameters');
      }

      if (status === 500) {
        throw new Error(errorData?.error || 'Backend service error');
      }
    }

    console.error('[PolygonService] Error fetching news:', error);
    throw new Error(`Failed to fetch news for ${ticker}: ${error}`);
  }
}

/**
 * Transform Polygon article to NewsDetails database format
 * @param article - Polygon news article
 * @param ticker - Stock ticker symbol
 * @returns NewsDetails object ready for database insertion
 */
export function transformPolygonToNewsDetails(
  article: PolygonNewsArticle,
  ticker: string
): NewsDetails {
  // Extract date from published_utc (YYYY-MM-DD)
  const date = article.published_utc.split('T')[0];

  return {
    date,
    ticker,
    articleTickers: article.tickers.join(','), // Convert array to comma-separated string
    title: article.title,
    articleDate: date,
    articleUrl: article.article_url,
    publisher: article.publisher.name,
    ampUrl: article.amp_url || '',
    articleDescription: article.description || '',
  };
}
