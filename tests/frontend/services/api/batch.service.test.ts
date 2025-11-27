import { fetchBatchStocks, fetchBatchNews, fetchBatchSentiment } from '@/services/api/batch.service';
import axios from 'axios';
import { Environment } from '@/config/environment';

// Mock Environment
jest.mock('@/config/environment', () => ({
  Environment: {
    BACKEND_URL: 'https://mock-backend.com',
  },
}));

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock createBackendClient inside batch.service.ts
// Since we can't easily mock the internal function, we'll rely on mocking axios which is used by it.
// However, `createBackendClient` creates an instance.
const mockPost = jest.fn();
mockedAxios.create.mockReturnValue({
  post: mockPost,
} as any);

describe('Batch API Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchBatchStocks', () => {
    it('should call backend batch stocks endpoint', async () => {
      const request = { tickers: ['AAPL'], startDate: '2025-01-01' };
      mockPost.mockResolvedValue({ data: { data: { AAPL: [] }, errors: {}, _meta: {} } });

      await fetchBatchStocks(request);

      expect(mockPost).toHaveBeenCalledWith('/batch/stocks', request);
    });
  });

  describe('fetchBatchNews', () => {
    it('should call backend batch news endpoint', async () => {
      const request = { tickers: ['AAPL'], limit: 5 };
      mockPost.mockResolvedValue({ data: { data: { AAPL: [] }, errors: {}, _meta: {} } });

      await fetchBatchNews(request);

      expect(mockPost).toHaveBeenCalledWith('/batch/news', request);
    });
  });

  describe('fetchBatchSentiment', () => {
    it('should call backend batch sentiment endpoint', async () => {
      const request = { tickers: ['AAPL'], startDate: '2025-01-01' };
      mockPost.mockResolvedValue({ data: { data: { AAPL: [] }, errors: {}, _meta: {} } });

      await fetchBatchSentiment(request);

      expect(mockPost).toHaveBeenCalledWith('/batch/sentiment', request);
    });
  });
});
