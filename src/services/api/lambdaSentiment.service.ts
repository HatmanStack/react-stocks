/**
 * Lambda Sentiment API Service
 * Fetches sentiment analysis from Lambda backend async endpoints
 * Handles job triggering, status polling, and result fetching
 */

import axios, { AxiosInstance } from 'axios';
import { Environment } from '@/config/environment';

// Backend API configuration
const BACKEND_TIMEOUT = 30000; // 30 seconds (Lambda handles retries)

/**
 * Request to trigger sentiment analysis
 */
export interface SentimentJobRequest {
  ticker: string;
  startDate: string;
  endDate: string;
}

/**
 * Response from triggering sentiment analysis
 */
export interface SentimentJobResponse {
  jobId: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  cached: boolean;
}

/**
 * Job status response with full details
 */
export interface SentimentJobStatus extends SentimentJobResponse {
  ticker: string;
  startDate: string;
  endDate: string;
  articlesProcessed?: number;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  error?: string;
}

/**
 * Daily sentiment data point
 */
export interface DailySentiment {
  date: string;
  positive: number;
  negative: number;
  sentimentScore: number;
  classification: 'POS' | 'NEG' | 'NEUT';
}

/**
 * Sentiment results response
 */
export interface SentimentResultsResponse {
  ticker: string;
  startDate: string;
  endDate: string;
  dailySentiment: DailySentiment[];
  cached: boolean;
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
 * Trigger sentiment analysis job
 * @param request - Job request with ticker and date range
 * @returns Job response with jobId and status
 * @throws Error if request fails
 */
export async function triggerSentimentAnalysis(
  request: SentimentJobRequest
): Promise<SentimentJobResponse> {
  const client = createBackendClient();

  try {
    console.log(
      `[LambdaSentiment] Triggering sentiment analysis for ${request.ticker} from ${request.startDate} to ${request.endDate}`
    );

    const response = await client.post<SentimentJobResponse>(
      '/sentiment',
      request
    );

    console.log(
      `[LambdaSentiment] Sentiment job ${response.data.jobId} created with status: ${response.data.status}`
    );

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const errorData = error.response?.data as { error?: string };

      // Log detailed error info for debugging
      console.error('[LambdaSentiment] Axios error details:', {
        message: error.message,
        code: error.code,
        status: status,
        statusText: error.response?.statusText,
        data: errorData,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          baseURL: error.config?.baseURL,
        },
      });

      if (status === 400) {
        throw new Error(errorData?.error || 'Invalid request parameters');
      }

      if (status === 429) {
        throw new Error('Rate limit exceeded. Please try again in a moment.');
      }

      if (status === 500) {
        throw new Error(errorData?.error || 'Backend service error');
      }

      // Network or CORS error
      if (!status) {
        throw new Error(
          `Network error: ${error.message}. Check your internet connection and CORS configuration.`
        );
      }
    }

    console.error('[LambdaSentiment] Error triggering sentiment analysis:', error);
    throw new Error(`Failed to trigger sentiment analysis: ${error}`);
  }
}

/**
 * Get sentiment job status
 * @param jobId - Job ID to check
 * @returns Job status with details
 * @throws Error if job not found or request fails
 */
export async function getSentimentJobStatus(
  jobId: string
): Promise<SentimentJobStatus> {
  const client = createBackendClient();

  try {
    console.log(`[LambdaSentiment] Checking status for job ${jobId}`);

    const response = await client.get<SentimentJobStatus>(
      `/sentiment/job/${jobId}`
    );

    console.log(`[LambdaSentiment] Job ${jobId} status: ${response.data.status}`);

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const errorData = error.response?.data as { error?: string };

      if (status === 404) {
        throw new Error(errorData?.error || 'Job not found');
      }

      if (status === 400) {
        throw new Error(errorData?.error || 'Invalid job ID');
      }

      if (status === 500) {
        throw new Error(errorData?.error || 'Backend service error');
      }
    }

    console.error('[LambdaSentiment] Error fetching job status:', error);
    throw new Error(`Failed to fetch job status: ${error}`);
  }
}

/**
 * Get sentiment analysis results
 * @param ticker - Stock ticker symbol
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 * @returns Sentiment results with daily data
 * @throws Error if no data found or request fails
 */
export async function getSentimentResults(
  ticker: string,
  startDate: string,
  endDate: string
): Promise<SentimentResultsResponse> {
  const client = createBackendClient();

  try {
    console.log(
      `[LambdaSentiment] Fetching sentiment results for ${ticker} from ${startDate} to ${endDate}`
    );

    const response = await client.get<SentimentResultsResponse>('/sentiment', {
      params: { ticker, startDate, endDate },
    });

    console.log(
      `[LambdaSentiment] Fetched ${response.data.dailySentiment.length} daily sentiment records for ${ticker}`
    );

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const errorData = error.response?.data as { error?: string };

      if (status === 404) {
        throw new Error(errorData?.error || 'No sentiment data found');
      }

      if (status === 400) {
        throw new Error(errorData?.error || 'Invalid request parameters');
      }

      if (status === 429) {
        throw new Error('Rate limit exceeded. Please try again in a moment.');
      }

      if (status === 500) {
        throw new Error(errorData?.error || 'Backend service error');
      }
    }

    console.error('[LambdaSentiment] Error fetching sentiment results:', error);
    throw new Error(`Failed to fetch sentiment results: ${error}`);
  }
}
