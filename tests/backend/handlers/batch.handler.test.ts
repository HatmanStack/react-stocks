import { jest, describe, it, expect, beforeAll, beforeEach } from '@jest/globals';

// Mock dependencies
const mockHandlePricesRequest = jest.fn();
const mockHandleNewsWithCache = jest.fn();
const mockGetSentimentResults = jest.fn();

// Use factory function to mock module and preserve other exports if needed (though we only need one)
jest.unstable_mockModule('../../../backend/src/handlers/stocks.handler', () => ({
  handlePricesRequest: mockHandlePricesRequest,
}));

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
  handleBatchStocksRequest,
  handleBatchNewsRequest,
  handleBatchSentimentRequest
} = await import('../../../backend/src/handlers/batch.handler');

// Set required API keys for all tests
beforeAll(() => {
  process.env.TIINGO_API_KEY = 'test-tiingo-key';
  process.env.FINNHUB_API_KEY = 'test-finnhub-key';
});

describe('handleBatchStocksRequest', () => {
  const mockEvent = (body: any) => ({
    body: JSON.stringify(body),
    requestContext: {
      requestId: 'test-req-id',
    },
  } as any);

  beforeEach(() => {
    jest.clearAllMocks();
    mockSuccessResponse.mockImplementation((data, statusCode, meta) => {
      // Replicate the logic in successResponse to wrap data if meta is provided
      // The implementation in response.util.ts is:
      // return { statusCode, headers: ..., body: JSON.stringify(meta ? { data, ...meta } : { data }) }
      const body = meta ? { data, ...meta } : { data };
      return {
        statusCode,
        body: JSON.stringify(body),
        headers: {}, // Mock doesn't need real CORS headers
      };
    });
    mockErrorResponse.mockImplementation((message, statusCode) => ({
      statusCode,
      body: JSON.stringify({ error: message }), // Note: errorResponse returns { error: message } not { message }
      headers: {},
    }));
  });

  it('should return data for valid tickers', async () => {
    // Mock handlePricesRequest to return success
    mockHandlePricesRequest.mockResolvedValue({
      data: [{ date: '2025-01-01', open: 100, high: 110, low: 90, close: 105, volume: 1000 }],
      cached: true,
      cacheHitRate: 1,
    } as never);

    const event = mockEvent({
      tickers: ['AAPL', 'GOOGL'],
      startDate: '2025-01-01'
    });

    const response = await handleBatchStocksRequest(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.AAPL).toBeDefined();
    expect(body.data.GOOGL).toBeDefined();
    expect(body._meta.successCount).toBe(2);
    expect(body._meta.errorCount).toBe(0);
  });

  it('should return partial results when one ticker fails', async () => {
    // Mock handlePricesRequest to fail for INVALID ticker
    mockHandlePricesRequest.mockImplementation(((ticker: string) => {
      if (ticker === 'INVALID') {
        return Promise.reject(new Error('Ticker not found'));
      }
      return Promise.resolve({
        data: [{ date: '2025-01-01', open: 100, high: 110, low: 90, close: 105, volume: 1000 }],
        cached: true,
      });
    }) as any);

    const event = mockEvent({
      tickers: ['AAPL', 'INVALID'],
      startDate: '2025-01-01'
    });

    const response = await handleBatchStocksRequest(event);
    const body = JSON.parse(response.body);

    expect(body.data.AAPL).toBeDefined();
    expect(body.errors.INVALID).toContain('Ticker not found');
    expect(body._meta.successCount).toBe(1);
    expect(body._meta.errorCount).toBe(1);
  });

  it('should reject batch with >10 tickers', async () => {
    const event = mockEvent({
      tickers: Array(11).fill('AAPL'), // 11 tickers
      startDate: '2025-01-01'
    });

    await handleBatchStocksRequest(event);

    expect(mockErrorResponse).toHaveBeenCalledWith('Maximum 10 tickers per batch', 400);
  });

  it('should reject invalid ticker format', async () => {
    const event = mockEvent({
      tickers: ['VALID', 'INV@LID'],
      startDate: '2025-01-01'
    });

    await handleBatchStocksRequest(event);

    expect(mockErrorResponse).toHaveBeenCalledWith(expect.stringContaining('Invalid ticker format'), 400);
  });

  it('should reject invalid date format', async () => {
    const event = mockEvent({
      tickers: ['AAPL'],
      startDate: '01-01-2025' // Wrong format
    });

    await handleBatchStocksRequest(event);

    expect(mockErrorResponse).toHaveBeenCalledWith(expect.stringContaining('Invalid startDate format'), 400);
  });

  it('should reject invalid date range', async () => {
    const event = mockEvent({
      tickers: ['AAPL'],
      startDate: '2025-01-02',
      endDate: '2025-01-01' // End before start
    });

    await handleBatchStocksRequest(event);

    expect(mockErrorResponse).toHaveBeenCalledWith(expect.stringContaining('Invalid date range'), 400);
  });

  it('should handle missing API key', async () => {
    const originalApiKey = process.env.TIINGO_API_KEY;
    delete process.env.TIINGO_API_KEY;

    const event = mockEvent({
      tickers: ['AAPL'],
      startDate: '2025-01-01'
    });

    await handleBatchStocksRequest(event);

    expect(mockErrorResponse).toHaveBeenCalledWith('Server configuration error', 500);

    process.env.TIINGO_API_KEY = originalApiKey;
  });
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
