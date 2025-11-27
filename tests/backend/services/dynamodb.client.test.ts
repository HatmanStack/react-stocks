import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Hoist mocks
const mockSend = jest.fn();

// Mock DynamoDBClient and DocumentClient
// We need to mock the module so that when 'dynamodb.client.ts' imports them, it gets our mocks.
// AND we need to expose the mocked classes to our test so we can verify calls.

const MockPutCommand = jest.fn();
const MockGetCommand = jest.fn();
const MockQueryCommand = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => {
    return {
        DynamoDBClient: jest.fn().mockImplementation(() => ({}))
    };
});

jest.mock('@aws-sdk/lib-dynamodb', () => {
    return {
        DynamoDBDocumentClient: {
            from: jest.fn().mockReturnValue({
                send: mockSend
            })
        },
        PutCommand: MockPutCommand,
        GetCommand: MockGetCommand,
        QueryCommand: MockQueryCommand
    };
});

// Import after mocking
const { DynamoDBClientWrapper } = await import('../../../backend/src/services/dynamodb.client');

describe('DynamoDBClientWrapper', () => {
    let client: any;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.STOCK_HISTORICAL_TABLE = 'stocks';
        process.env.ARTICLE_ANALYSIS_TABLE = 'articles';
        process.env.DAILY_SENTIMENT_TABLE = 'sentiment';
        client = new DynamoDBClientWrapper();
    });

    it('putStockData should call PutCommand', async () => {
        const item = { ticker: 'AAPL', date: '2023-01-01', open: 100, high: 110, low: 90, close: 105, volume: 1000 };
        await client.putStockData(item);

        expect(MockPutCommand).toHaveBeenCalledWith({
            TableName: 'stocks',
            Item: item
        });
        expect(mockSend).toHaveBeenCalled();
    });

    it('getStockData should call GetCommand', async () => {
        (mockSend as any).mockResolvedValue({ Item: { ticker: 'AAPL' } });

        const result = await client.getStockData('AAPL', '2023-01-01');

        expect(MockGetCommand).toHaveBeenCalledWith({
            TableName: 'stocks',
            Key: { ticker: 'AAPL', date: '2023-01-01' }
        });
        expect(result).toEqual({ ticker: 'AAPL' });
    });

    it('queryStockDataByDateRange should call QueryCommand', async () => {
        (mockSend as any).mockResolvedValue({ Items: [{ ticker: 'AAPL' }] });

        const result = await client.queryStockDataByDateRange('AAPL', '2023-01-01', '2023-01-31');

        expect(MockQueryCommand).toHaveBeenCalledWith({
            TableName: 'stocks',
            KeyConditionExpression: 'ticker = :ticker AND #date BETWEEN :startDate AND :endDate',
            ExpressionAttributeNames: { '#date': 'date' },
            ExpressionAttributeValues: {
                ':ticker': 'AAPL',
                ':startDate': '2023-01-01',
                ':endDate': '2023-01-31'
            }
        });
        expect(result).toHaveLength(1);
    });

    it('putArticleAnalysis should call PutCommand', async () => {
        const item = { ticker: 'AAPL', 'articleHash#date': 'h#d', articleHash: 'h', date: 'd' };
        await client.putArticleAnalysis(item);

        expect(MockPutCommand).toHaveBeenCalledWith({
            TableName: 'articles',
            Item: item
        });
    });

    it('queryArticlesByTicker should call QueryCommand and filter', async () => {
        // Mock returns items outside range to test filtering
        (mockSend as any).mockResolvedValue({
            Items: [
                { ticker: 'AAPL', date: '2023-01-15' }, // In range
                { ticker: 'AAPL', date: '2023-02-01' }  // Out of range
            ]
        });

        const result = await client.queryArticlesByTicker('AAPL', '2023-01-01', '2023-01-31');

        expect(MockQueryCommand).toHaveBeenCalledWith({
            TableName: 'articles',
            KeyConditionExpression: 'ticker = :ticker',
            ExpressionAttributeValues: { ':ticker': 'AAPL' }
        });

        // Should filter out the feb item
        expect(result).toHaveLength(1);
        expect(result[0].date).toBe('2023-01-15');
    });

    it('putDailySentiment should call PutCommand', async () => {
        const item = { ticker: 'AAPL', date: '2023-01-01', eventCounts: {} };
        await client.putDailySentiment(item);

        expect(MockPutCommand).toHaveBeenCalledWith({
            TableName: 'sentiment',
            Item: item
        });
    });

    it('getDailySentiment should call GetCommand', async () => {
        (mockSend as any).mockResolvedValue({ Item: { ticker: 'AAPL' } });

        const result = await client.getDailySentiment('AAPL', '2023-01-01');

        expect(MockGetCommand).toHaveBeenCalledWith({
            TableName: 'sentiment',
            Key: { ticker: 'AAPL', date: '2023-01-01' }
        });
        expect(result).toBeDefined();
    });
});
