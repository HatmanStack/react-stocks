/**
 * Batch API Service
 * Fetches aggregated data for multiple tickers in a single request
 */

import axios, { AxiosInstance } from 'axios';
import { Environment } from '@/config/environment';
import type { TiingoStockPrice } from './tiingo.types';
import type { FinnhubNewsArticle } from './finnhub.types';

// Backend API configuration
const BACKEND_TIMEOUT = 60000; // 60 seconds for batch requests (longer than single)

export interface BatchStocksRequest {
  tickers: string[];
  startDate: string;
  endDate?: string;
}

export interface BatchStocksResponse {
  data: Record<string, TiingoStockPrice[]>;
  errors: Record<string, string>;
  _meta: {
    successCount: number;
    errorCount: number;
    cached: Record<string, boolean>;
    timestamp: string;
  };
}

export interface BatchNewsRequest {
  tickers: string[];
  limit?: number;
}

export interface BatchNewsResponse {
  data: Record<string, FinnhubNewsArticle[]>;
  errors: Record<string, string>;
  _meta: {
    successCount: number;
    errorCount: number;
    cached: Record<string, boolean>;
    timestamp: string;
  };
}

export interface BatchSentimentRequest {
  tickers: string[];
  startDate: string;
  endDate?: string;
}

export interface DailySentiment {
  date: string;
  sentiment: number;
  positive: number;
  negative: number;
  neutral: number;
}

export interface SentimentResult {
  ticker: string;
  startDate: string;
  endDate: string;
  dailySentiment: DailySentiment[];
  cached: boolean;
}

export interface BatchSentimentResponse {
  data: Record<string, SentimentResult>;
  errors: Record<string, string>;
  _meta: {
    successCount: number;
    errorCount: number;
    cached: Record<string, boolean>;
    timestamp: string;
  };
}

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
 * Fetch batch stock prices
 */
export async function fetchBatchStocks(
  request: BatchStocksRequest
): Promise<BatchStocksResponse> {
  const client = createBackendClient();
  const response = await client.post<BatchStocksResponse>(
    '/batch/stocks',
    request
  );
  return response.data;
}

/**
 * Fetch batch news
 */
export async function fetchBatchNews(
  request: BatchNewsRequest
): Promise<BatchNewsResponse> {
  const client = createBackendClient();
  const response = await client.post<BatchNewsResponse>(
    '/batch/news',
    request
  );
  return response.data;
}

/**
 * Fetch batch sentiment
 */
export async function fetchBatchSentiment(
  request: BatchSentimentRequest
): Promise<BatchSentimentResponse> {
  const client = createBackendClient();
  const response = await client.post<BatchSentimentResponse>(
    '/batch/sentiment',
    request
  );
  return response.data;
}
