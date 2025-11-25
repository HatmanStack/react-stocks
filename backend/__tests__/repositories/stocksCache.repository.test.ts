// The issue is that ESM imports are read-only bindings, so simply casting them doesn't make them mocks if jest.mock didn't successfully replace the module.
// But I am using jest.mock factory.
// In ESM with experimental vm modules, jest.mock works but sometimes tricky.

// Let's use jest.unstable_mockModule again as it's the recommended way for ESM.

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/utils/cache.util.js', () => ({
  calculateTTLByDataType: jest.fn(),
  calculateTTL: jest.fn(),
  generateCacheKey: jest.fn(),
  isCacheFresh: jest.fn(),
  parseCacheKey: jest.fn(),
}));

jest.unstable_mockModule('../../src/utils/dynamodb.util.js', () => ({
  dynamoDb: {
    send: jest.fn(),
  },
  batchPutItems: jest.fn(),
  batchGetItems: jest.fn(),
}));

const { calculateTTLByDataType } = await import('../../src/utils/cache.util.js');
const { putStock, batchPutStocks } = await import('../../src/repositories/stocksCache.repository.js');
const { dynamoDb, batchPutItems } = await import('../../src/utils/dynamodb.util.js');

describe('StocksCacheRepository TTL Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('putStock uses date-aware TTL', async () => {
    // @ts-ignore
    calculateTTLByDataType.mockReturnValue(1234567890);

    const item = {
      ticker: 'AAPL',
      date: '2025-01-15',
      priceData: { open: 100, high: 110, low: 90, close: 105, volume: 1000 },
      fetchedAt: 1700000000000,
    };

    await putStock(item);

    expect(calculateTTLByDataType).toHaveBeenCalledWith('stock', '2025-01-15');

    expect(dynamoDb.send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Item: expect.objectContaining({
            ttl: 1234567890,
            ticker: 'AAPL',
          }),
        }),
      })
    );
  });

  test('batchPutStocks calculates TTL per item', async () => {
    // @ts-ignore
    calculateTTLByDataType.mockReturnValue(9876543210);

    const items = [
      { ticker: 'AAPL', date: '2025-01-01', priceData: {} as any, fetchedAt: 1700000000000 },
      { ticker: 'GOOGL', date: '2025-01-02', priceData: {} as any, fetchedAt: 1700000000000 },
    ];

    await batchPutStocks(items);

    expect(calculateTTLByDataType).toHaveBeenCalledTimes(2);
    expect(calculateTTLByDataType).toHaveBeenCalledWith('stock', '2025-01-01');
    expect(calculateTTLByDataType).toHaveBeenCalledWith('stock', '2025-01-02');

    expect(batchPutItems).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({ ticker: 'AAPL', ttl: 9876543210 }),
        expect.objectContaining({ ticker: 'GOOGL', ttl: 9876543210 }),
      ])
    );
  });
});
