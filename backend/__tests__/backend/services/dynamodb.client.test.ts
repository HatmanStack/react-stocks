import { jest } from '@jest/globals';

// 1. Define mocks BEFORE imports
const mockSend = jest.fn() as jest.Mock<any>;

// 2. Mock the dependencies
jest.unstable_mockModule('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.unstable_mockModule('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn().mockReturnValue({
      send: mockSend,
    }),
  },
  PutCommand: jest.fn(),
  GetCommand: jest.fn(),
  QueryCommand: jest.fn(),
}));

// 3. Import the module under test
// We need to use dynamic import for unstable_mockModule to work
const { DynamoDBClientWrapper } = await import('../../../src/services/dynamodb.client');

describe('DynamoDBClientWrapper', () => {
  let dbClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STOCK_HISTORICAL_TABLE = 'StockTable';
    process.env.ARTICLE_ANALYSIS_TABLE = 'ArticleTable';
    process.env.DAILY_SENTIMENT_TABLE = 'SentimentTable';
    process.env.AWS_REGION = 'us-east-1';

    dbClient = new DynamoDBClientWrapper();
  });

  describe('putStockData', () => {
    it('should put stock data item', async () => {
      const data = {
        ticker: 'AAPL',
        date: '2023-01-01',
        open: 100,
        high: 110,
        low: 90,
        close: 105,
        volume: 1000,
      };

      await dbClient.putStockData(data);

      expect(mockSend).toHaveBeenCalled();
    });
  });

  describe('getStockData', () => {
    it('should get stock data item', async () => {
      const mockItem = { ticker: 'AAPL', date: '2023-01-01', close: 100 };
      mockSend.mockResolvedValueOnce({ Item: mockItem });

      const result = await dbClient.getStockData('AAPL', '2023-01-01');

      expect(mockSend).toHaveBeenCalled();
      expect(result).toEqual(mockItem);
    });

    it('should return undefined if not found', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const result = await dbClient.getStockData('AAPL', '2023-01-01');

      expect(result).toBeUndefined();
    });
  });

  describe('queryStockDataByDateRange', () => {
    it('should query stock data by date range', async () => {
      const mockItems = [
        { ticker: 'AAPL', date: '2023-01-01', close: 100 },
        { ticker: 'AAPL', date: '2023-01-02', close: 101 },
      ];
      mockSend.mockResolvedValueOnce({ Items: mockItems });

      const result = await dbClient.queryStockDataByDateRange('AAPL', '2023-01-01', '2023-01-31');

      expect(mockSend).toHaveBeenCalled();
      expect(result).toEqual(mockItems);
    });
  });
});
