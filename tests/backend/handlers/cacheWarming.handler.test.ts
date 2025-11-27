import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock dependencies BEFORE importing handler
const mockWarmAllTopTickers = jest.fn();
jest.unstable_mockModule('../../../backend/src/services/cacheWarming.service', () => ({
  warmAllTopTickers: mockWarmAllTopTickers,
}));

jest.unstable_mockModule('../../../backend/src/utils/error.util', () => ({
  logError: jest.fn(),
}));

// Import handler AFTER mocking
const { handler } = await import('../../../backend/src/handlers/cacheWarming.handler');

describe('Cache Warming Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should warm cache successfully', async () => {
    mockWarmAllTopTickers.mockResolvedValue({ success: 10, failure: 0 } as never);

    const event = {
      'detail-type': 'Scheduled Event',
      source: 'aws.events',
      time: '2025-01-01T14:00:00Z',
      id: 'test-event-id',
      resources: [],
      detail: {},
    };

    const result = await handler(event as any);

    expect(result).toEqual({ success: 10, failure: 0 });
    expect(mockWarmAllTopTickers).toHaveBeenCalled();
  });

  it('should handle errors', async () => {
    mockWarmAllTopTickers.mockRejectedValue(new Error('Warming failed') as never);

    const event = {
      'detail-type': 'Scheduled Event',
      source: 'aws.events',
      time: '2025-01-01T14:00:00Z',
      id: 'test-event-id',
      resources: [],
      detail: {},
    };

    await expect(handler(event as any)).rejects.toThrow('Warming failed');
  });
});
