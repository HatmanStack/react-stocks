/**
 * StocksCache Repository
 *
 * Provides CRUD operations for stock price data in DynamoDB cache
 */

import {
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { dynamoDb, batchGetItems, batchPutItems } from '../utils/dynamodb.util.js';
import { calculateTTL } from '../utils/cache.util.js';

const TABLE_NAME = process.env.STOCKS_CACHE_TABLE || 'StocksCache';

/**
 * Price data interface (OHLCV)
 */
export interface PriceData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjOpen?: number;
  adjHigh?: number;
  adjLow?: number;
  adjClose?: number;
  adjVolume?: number;
  divCash?: number;
  splitFactor?: number;
}

/**
 * Stock metadata interface
 */
export interface StockMetadata {
  ticker: string;
  name?: string;
  description?: string;
  exchange?: string;
  sector?: string;
  industry?: string;
}

/**
 * Stock cache item interface
 */
export interface StockCacheItem {
  ticker: string;
  date: string;
  priceData: PriceData;
  metadata?: StockMetadata;
  ttl: number;
  fetchedAt: number;
}

/**
 * Get stock price data for a specific ticker and date
 *
 * @param ticker - Stock ticker symbol
 * @param date - Date in ISO format (YYYY-MM-DD)
 * @returns Stock cache item or null if not found
 *
 * @example
 * const stock = await getStock('AAPL', '2025-01-15');
 */
export async function getStock(
  ticker: string,
  date: string
): Promise<StockCacheItem | null> {
  try {
    const command = new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        ticker: ticker.toUpperCase(),
        date,
      },
    });

    const response = await dynamoDb.send(command);

    if (!response.Item) {
      return null;
    }

    return response.Item as StockCacheItem;
  } catch (error) {
    console.error('[StocksCacheRepository] Error getting stock:', error, { ticker, date });
    throw error;
  }
}

/**
 * Cache stock price data
 * Automatically sets TTL to 7 days from now
 *
 * @param item - Stock cache item to store
 *
 * @example
 * await putStock({
 *   ticker: 'AAPL',
 *   date: '2025-01-15',
 *   priceData: { open: 150, high: 155, low: 149, close: 154, volume: 1000000 },
 *   fetchedAt: Date.now()
 * });
 */
export async function putStock(item: Omit<StockCacheItem, 'ttl'>): Promise<void> {
  try {
    const stockItem: StockCacheItem = {
      ...item,
      ticker: item.ticker.toUpperCase(),
      ttl: calculateTTL(7), // 7 days expiration
      fetchedAt: item.fetchedAt || Date.now(),
    };

    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: stockItem,
    });

    await dynamoDb.send(command);
  } catch (error) {
    console.error('[StocksCacheRepository] Error putting stock:', error, {
      ticker: item.ticker,
      date: item.date,
    });
    throw error;
  }
}

/**
 * Batch get stock prices for multiple dates
 *
 * @param ticker - Stock ticker symbol
 * @param dates - Array of dates in ISO format
 * @returns Array of stock cache items
 *
 * @example
 * const stocks = await batchGetStocks('AAPL', ['2025-01-01', '2025-01-02', '2025-01-03']);
 */
export async function batchGetStocks(
  ticker: string,
  dates: string[]
): Promise<StockCacheItem[]> {
  if (dates.length === 0) {
    return [];
  }

  try {
    const keys = dates.map((date) => ({
      ticker: ticker.toUpperCase(),
      date,
    }));

    return await batchGetItems<StockCacheItem>(TABLE_NAME, keys);
  } catch (error) {
    console.error('[StocksCacheRepository] Error batch getting stocks:', error, {
      ticker,
      dateCount: dates.length,
    });
    throw error;
  }
}

/**
 * Batch put stock prices
 * Handles chunking for DynamoDB's 25-item limit
 *
 * @param items - Array of stock cache items to store
 *
 * @example
 * await batchPutStocks([
 *   { ticker: 'AAPL', date: '2025-01-01', priceData: {...}, fetchedAt: Date.now() },
 *   { ticker: 'AAPL', date: '2025-01-02', priceData: {...}, fetchedAt: Date.now() }
 * ]);
 */
export async function batchPutStocks(
  items: Omit<StockCacheItem, 'ttl'>[]
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  try {
    const stockItems: StockCacheItem[] = items.map((item) => ({
      ...item,
      ticker: item.ticker.toUpperCase(),
      ttl: calculateTTL(7),
      fetchedAt: item.fetchedAt || Date.now(),
    }));

    await batchPutItems(TABLE_NAME, stockItems);
  } catch (error) {
    console.error('[StocksCacheRepository] Error batch putting stocks:', error, {
      itemCount: items.length,
    });
    throw error;
  }
}

/**
 * Query stock prices by date range
 * Uses DynamoDB Query API for efficient range queries
 *
 * @param ticker - Stock ticker symbol
 * @param startDate - Start date in ISO format (inclusive)
 * @param endDate - End date in ISO format (inclusive)
 * @returns Array of stock cache items within date range
 *
 * @example
 * const stocks = await queryStocksByDateRange('AAPL', '2025-01-01', '2025-01-30');
 */
export async function queryStocksByDateRange(
  ticker: string,
  startDate: string,
  endDate: string
): Promise<StockCacheItem[]> {
  try {
    const command = new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: '#ticker = :ticker AND #date BETWEEN :startDate AND :endDate',
      ExpressionAttributeNames: {
        '#ticker': 'ticker',
        '#date': 'date',
      },
      ExpressionAttributeValues: {
        ':ticker': ticker.toUpperCase(),
        ':startDate': startDate,
        ':endDate': endDate,
      },
    });

    const response = await dynamoDb.send(command);

    return (response.Items as StockCacheItem[]) || [];
  } catch (error) {
    console.error('[StocksCacheRepository] Error querying stocks by date range:', error, {
      ticker,
      startDate,
      endDate,
    });
    throw error;
  }
}
