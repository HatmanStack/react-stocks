import { jest, describe, it, expect, beforeAll, beforeEach } from '@jest/globals';

// Mock dependencies
const mockHandleNewsWithCache = jest.fn();
const mockGetSentimentResults = jest.fn();

jest.unstable_mockModule('../../../backend/src/handlers/news.handler', () => ({
  handleNewsWithCache: mockHandleNewsWithCache,
}));

jest.unstable_mockModule('../../../backend/src/handlers/sentiment.handler', () => ({
  getSentimentResults: mockGetSentimentResults,
}));

// Mock utilities
const mockSuccessResponse = jest.fn();
const mockErrorResponse = jest.fn();

jest.unstable_mockModule('../../../backend/src/utils/response.util', () => ({
  successResponse: mockSuccessResponse,
  errorResponse: mockErrorResponse,
}));

jest.unstable_mockModule('../../../backend/src/utils/metrics.util', () => ({
  logMetrics: jest.fn(),
  MetricUnit: {
    Milliseconds: 'Milliseconds',
    Count: 'Count',
  },
}));

jest.unstable_mockModule('../../../backend/src/utils/error.util', () => ({
  logError: jest.fn(),
}));

// Import modules AFTER mocking
const {
  handleBatchNewsRequest,
  handleBatchSentimentRequest
} = await import('../../../backend/src/handlers/batch.handler');

// Set required API keys for all tests
beforeAll(() => {
  process.env.FINNHUB_API_KEY = 'test-finnhub-key';
});

describe('handleBatchNewsRequest', () => {
  const mockEvent = (body: any) => ({
    body: JSON.stringify(body),
    requestContext: {
      requestId: 'test-req-id',
    },
  } as any);

  beforeEach(() => {
    jest.clearAllMocks();
    mockSuccessResponse.mockImplementation((data, statusCode, meta) => {
      const body = meta ? { data, ...meta } : { data };
      return {
        statusCode,
        body: JSON.stringify(body),
        headers: {},
      };
    });
    mockErrorResponse.mockImplementation((message, statusCode) => ({
      statusCode,
      body: JSON.stringify({ error: message }),
      headers: {},
    }));
  });

  it('should return data for valid tickers', async () => {
    mockHandleNewsWithCache.mockResolvedValue({
      data: [{ id: 1, headline: 'News 1', date: '2025-01-01' }],
      cached: true,
      newArticlesCount: 0,
      cachedArticlesCount: 1,
    } as never);

    const event = mockEvent({
      tickers: ['AAPL', 'GOOGL'],
      limit: 5
    });

    const response = await handleBatchNewsRequest(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.AAPL).toBeDefined();
    expect(body.data.GOOGL).toBeDefined();
    expect(body._meta.successCount).toBe(2);
  });

  it('should reject batch with >10 tickers', async () => {
    const event = mockEvent({
      tickers: Array(11).fill('AAPL'),
    });

    await handleBatchNewsRequest(event);
    expect(mockErrorResponse).toHaveBeenCalledWith('Maximum 10 tickers per batch', 400);
  });

  it('should reject invalid limit', async () => {
    const event = mockEvent({
      tickers: ['AAPL'],
      limit: 100 // Too high
    });

    await handleBatchNewsRequest(event);
    expect(mockErrorResponse).toHaveBeenCalledWith(expect.stringContaining('Invalid limit'), 400);
  });
});

describe('handleBatchSentimentRequest', () => {
  const mockEvent = (body: any) => ({
    body: JSON.stringify(body),
    requestContext: {
      requestId: 'test-req-id',
    },
  } as any);

  beforeEach(() => {
    jest.clearAllMocks();
    mockSuccessResponse.mockImplementation((data, statusCode, meta) => {
      const body = meta ? { data, ...meta } : { data };
      return {
        statusCode,
        body: JSON.stringify(body),
        headers: {},
      };
    });
    mockErrorResponse.mockImplementation((message, statusCode) => ({
      statusCode,
      body: JSON.stringify({ error: message }),
      headers: {},
    }));
  });

  it('should return data for valid tickers', async () => {
    // Mock getSentimentResults
    mockGetSentimentResults.mockResolvedValue({
      ticker: 'AAPL',
      startDate: '2025-01-01',
      endDate: '2025-01-05',
      dailySentiment: [{ date: '2025-01-01', sentiment: 0.5 }],
      cached: true
    } as never);

    const event = mockEvent({
      tickers: ['AAPL', 'GOOGL'],
      startDate: '2025-01-01',
      endDate: '2025-01-05'
    });

    const response = await handleBatchSentimentRequest(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.AAPL).toBeDefined();
    expect(body.data.GOOGL).toBeDefined();
    expect(body._meta.successCount).toBe(2);
  });

  it('should reject batch with >10 tickers', async () => {
    const event = mockEvent({
      tickers: Array(11).fill('AAPL'),
      startDate: '2025-01-01',
      endDate: '2025-01-05'
    });

    await handleBatchSentimentRequest(event);
    expect(mockErrorResponse).toHaveBeenCalledWith('Maximum 10 tickers per batch', 400);
  });
});
