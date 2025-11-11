/**
 * Polygon.io API Service
 * Fetches news articles from Polygon.io API
 */

import axios, { AxiosInstance } from 'axios';
import type { PolygonNewsArticle, PolygonNewsResponse } from '../types/polygon.types';
import { APIError } from '../utils/error.util';

// Polygon API configuration
const POLYGON_BASE_URL = 'https://api.polygon.io';
const POLYGON_TIMEOUT = 10000; // 10 seconds

/**
 * Create axios instance for Polygon API
 */
function createPolygonClient(): AxiosInstance {
  return axios.create({
    baseURL: POLYGON_BASE_URL,
    timeout: POLYGON_TIMEOUT,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Fetch news articles from Polygon API
 * @param ticker - Stock ticker symbol (e.g., "AAPL")
 * @param startDate - Start date in YYYY-MM-DD format (optional)
 * @param endDate - End date in YYYY-MM-DD format (optional)
 * @param limit - Maximum number of articles per request (default: 100, max: 1000)
 * @param apiKey - Polygon API key
 * @returns Array of news articles
 * @throws APIError if API request fails
 */
export async function fetchNews(
  ticker: string,
  startDate: string | undefined,
  endDate: string | undefined,
  limit: number = 100,
  apiKey: string
): Promise<PolygonNewsArticle[]> {
  const client = createPolygonClient();
  const allArticles: PolygonNewsArticle[] = [];

  try {
    let nextUrl: string | undefined;
    let currentPage = 0;
    const maxPages = 10; // Safety limit to prevent infinite loops

    do {
      currentPage++;

      console.log(
        `[PolygonService] Fetching news for ${ticker} (page ${currentPage})`
      );

      // Build request URL
      let url: string;
      if (nextUrl) {
        // Use pagination URL (already includes API key)
        url = nextUrl.replace(POLYGON_BASE_URL, '');
      } else {
        // First request - build params
        const params: Record<string, string | number> = {
          ticker,
          limit,
          apiKey,
        };

        // Add date filters
        if (startDate) {
          params['published_utc.gte'] = startDate;
        }
        if (endDate) {
          params['published_utc.lte'] = endDate;
        }

        const queryString = new URLSearchParams(
          params as Record<string, string>
        ).toString();
        url = `/v2/reference/news?${queryString}`;
      }

      const response = await client.get<PolygonNewsResponse>(url);

      if (response.data.status !== 'OK') {
        console.error(
          '[PolygonService] API returned non-OK status:',
          response.data.status
        );
        break;
      }

      const articles = response.data.results || [];
      allArticles.push(...articles);

      console.log(
        `[PolygonService] Fetched ${articles.length} articles (total: ${allArticles.length})`
      );

      // Check for pagination
      nextUrl = response.data.next_url;

      // Safety check to prevent infinite loops
      if (currentPage >= maxPages) {
        console.warn(
          `[PolygonService] Reached maximum page limit (${maxPages})`
        );
        break;
      }

      // Rate limiting: Polygon free tier allows 5 requests/minute
      // Add a small delay between paginated requests
      if (nextUrl) {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
      }
    } while (nextUrl);

    console.log(
      `[PolygonService] Completed fetching ${allArticles.length} articles for ${ticker}`
    );
    return allArticles;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;

      if (status === 429) {
        throw new APIError(
          'Rate limit exceeded. Polygon free tier allows 5 requests/minute. Please try again later.',
          429
        );
      }

      if (status === 401 || status === 403) {
        throw new APIError('Invalid API key. Please check your Polygon API key.', status);
      }

      if (status === 404) {
        console.warn(`[PolygonService] No news found for ticker ${ticker}`);
        return []; // Return empty array instead of error
      }
    }

    console.error('[PolygonService] Error fetching news:', error);
    throw new APIError(`Failed to fetch news for ${ticker}`, 500);
  }
}
