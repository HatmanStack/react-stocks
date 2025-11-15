/**
 * Unit tests for Lambda Sentiment API Service
 */

import axios from 'axios';
import {
  triggerSentimentAnalysis,
  getSentimentJobStatus,
  getSentimentResults,
} from '@/services/api/lambdaSentiment.service';
import type {
  SentimentJobRequest,
  SentimentJobResponse,
  SentimentJobStatus,
  SentimentResultsResponse,
} from '@/services/api/lambdaSentiment.service';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock environment configuration
jest.mock('@/config/environment', () => ({
  Environment: {
    BACKEND_URL: 'https://test-api.execute-api.us-east-1.amazonaws.com',
    USE_BROWSER_SENTIMENT: false,
    USE_BROWSER_PREDICTION: false,
  },
}));

describe('Lambda Sentiment Service', () => {
  let mockAxiosInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock axios instance
    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);

    // Mock axios.isAxiosError
    (mockedAxios.isAxiosError as unknown as jest.Mock) = jest.fn((error: any) => {
      return error && error.isAxiosError === true;
    });
  });

  describe('triggerSentimentAnalysis', () => {
    it('should trigger sentiment analysis and return job response', async () => {
      const mockRequest: SentimentJobRequest = {
        ticker: 'AAPL',
        startDate: '2025-01-01',
        endDate: '2025-01-30',
      };

      const mockResponse: SentimentJobResponse = {
        jobId: 'AAPL_2025-01-01_2025-01-30',
        status: 'PENDING',
        cached: false,
      };

      mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

      const result = await triggerSentimentAnalysis(mockRequest);

      expect(result).toEqual(mockResponse);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/sentiment',
        mockRequest
      );
    });

    it('should handle cached sentiment (immediate completion)', async () => {
      const mockRequest: SentimentJobRequest = {
        ticker: 'GOOGL',
        startDate: '2025-01-01',
        endDate: '2025-01-15',
      };

      const mockResponse: SentimentJobResponse = {
        jobId: 'GOOGL_2025-01-01_2025-01-15',
        status: 'COMPLETED',
        cached: true,
      };

      mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

      const result = await triggerSentimentAnalysis(mockRequest);

      expect(result).toEqual(mockResponse);
      expect(result.cached).toBe(true);
      expect(result.status).toBe('COMPLETED');
    });

    it('should handle network errors', async () => {
      const mockRequest: SentimentJobRequest = {
        ticker: 'AAPL',
        startDate: '2025-01-01',
        endDate: '2025-01-30',
      };

      const axiosError = new Error('Network error');
      Object.assign(axiosError, {
        isAxiosError: true,
        code: 'ECONNREFUSED',
      });

      mockAxiosInstance.post.mockRejectedValue(axiosError);

      await expect(triggerSentimentAnalysis(mockRequest)).rejects.toThrow(
        'Failed to trigger sentiment analysis'
      );
    });

    it('should handle 400 bad request errors', async () => {
      const mockRequest: SentimentJobRequest = {
        ticker: '',
        startDate: '2025-01-01',
        endDate: '2025-01-30',
      };

      const axiosError = new Error('Invalid ticker');
      Object.assign(axiosError, {
        isAxiosError: true,
        response: {
          status: 400,
          data: { error: 'Ticker is required' },
        },
      });

      mockAxiosInstance.post.mockRejectedValue(axiosError);

      await expect(triggerSentimentAnalysis(mockRequest)).rejects.toThrow(
        'Ticker is required'
      );
    });
  });

  describe('getSentimentJobStatus', () => {
    it('should fetch job status for valid job ID', async () => {
      const jobId = 'AAPL_2025-01-01_2025-01-30';

      const mockResponse: SentimentJobStatus = {
        jobId,
        status: 'IN_PROGRESS',
        ticker: 'AAPL',
        startDate: '2025-01-01',
        endDate: '2025-01-30',
        articlesProcessed: 15,
        startedAt: Date.now(),
        cached: false,
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockResponse });

      const result = await getSentimentJobStatus(jobId);

      expect(result).toEqual(mockResponse);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(`/sentiment/job/${jobId}`);
    });

    it('should handle completed job status', async () => {
      const jobId = 'GOOGL_2025-01-01_2025-01-15';

      const mockResponse: SentimentJobStatus = {
        jobId,
        status: 'COMPLETED',
        ticker: 'GOOGL',
        startDate: '2025-01-01',
        endDate: '2025-01-15',
        articlesProcessed: 25,
        startedAt: Date.now() - 10000,
        completedAt: Date.now(),
        durationMs: 10000,
        cached: false,
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockResponse });

      const result = await getSentimentJobStatus(jobId);

      expect(result.status).toBe('COMPLETED');
      expect(result.articlesProcessed).toBe(25);
      expect(result.completedAt).toBeDefined();
    });

    it('should handle failed job status', async () => {
      const jobId = 'TSLA_2025-01-01_2025-01-30';

      const mockResponse: SentimentJobStatus = {
        jobId,
        status: 'FAILED',
        ticker: 'TSLA',
        startDate: '2025-01-01',
        endDate: '2025-01-30',
        error: 'Failed to fetch news articles',
        cached: false,
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockResponse });

      const result = await getSentimentJobStatus(jobId);

      expect(result.status).toBe('FAILED');
      expect(result.error).toBe('Failed to fetch news articles');
    });

    it('should handle 404 job not found', async () => {
      const jobId = 'INVALID_JOB_ID';

      const axiosError = new Error('Job not found');
      Object.assign(axiosError, {
        isAxiosError: true,
        response: {
          status: 404,
          data: { error: 'Job not found' },
        },
      });

      mockAxiosInstance.get.mockRejectedValue(axiosError);

      await expect(getSentimentJobStatus(jobId)).rejects.toThrow('Job not found');
    });
  });

  describe('getSentimentResults', () => {
    it('should fetch sentiment results for ticker and date range', async () => {
      const ticker = 'AAPL';
      const startDate = '2025-01-01';
      const endDate = '2025-01-30';

      const mockResponse: SentimentResultsResponse = {
        ticker,
        startDate,
        endDate,
        dailySentiment: [
          {
            date: '2025-01-15',
            positive: 45,
            negative: 12,
            sentimentScore: 0.65,
            classification: 'POS',
          },
          {
            date: '2025-01-16',
            positive: 30,
            negative: 25,
            sentimentScore: 0.1,
            classification: 'NEUT',
          },
        ],
        cached: true,
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockResponse });

      const result = await getSentimentResults(ticker, startDate, endDate);

      expect(result).toEqual(mockResponse);
      expect(result.dailySentiment).toHaveLength(2);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/sentiment', {
        params: { ticker, startDate, endDate },
      });
    });

    it('should handle empty results', async () => {
      const ticker = 'MSFT';
      const startDate = '2025-01-01';
      const endDate = '2025-01-05';

      const mockResponse: SentimentResultsResponse = {
        ticker,
        startDate,
        endDate,
        dailySentiment: [],
        cached: false,
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockResponse });

      const result = await getSentimentResults(ticker, startDate, endDate);

      expect(result.dailySentiment).toHaveLength(0);
      expect(result.cached).toBe(false);
    });

    it('should handle 404 no data found', async () => {
      const ticker = 'INVALID';
      const startDate = '2025-01-01';
      const endDate = '2025-01-30';

      const axiosError = new Error('No sentiment data found');
      Object.assign(axiosError, {
        isAxiosError: true,
        response: {
          status: 404,
          data: { error: 'No sentiment data found' },
        },
      });

      mockAxiosInstance.get.mockRejectedValue(axiosError);

      await expect(getSentimentResults(ticker, startDate, endDate)).rejects.toThrow(
        'No sentiment data found'
      );
    });

    it('should handle network errors', async () => {
      const ticker = 'AAPL';
      const startDate = '2025-01-01';
      const endDate = '2025-01-30';

      const axiosError = new Error('Network error');
      Object.assign(axiosError, {
        isAxiosError: true,
        code: 'ETIMEDOUT',
      });

      mockAxiosInstance.get.mockRejectedValue(axiosError);

      await expect(getSentimentResults(ticker, startDate, endDate)).rejects.toThrow(
        'Failed to fetch sentiment results'
      );
    });
  });
});
