/**
 * SentimentCache Repository
 *
 * Provides CRUD operations for sentiment analysis results in DynamoDB cache
 */

import {
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { dynamoDb, batchPutItems } from '../utils/dynamodb.util.js';
import { calculateTTL } from '../utils/cache.util.js';

const TABLE_NAME = process.env.SENTIMENT_CACHE_TABLE || 'SentimentCache';

/**
 * Sentiment data interface
 */
export interface SentimentData {
  positive: number;
  negative: number;
  sentimentScore: number;
  classification: 'POS' | 'NEG' | 'NEUT';
}

/**
 * Sentiment cache item interface
 */
export interface SentimentCacheItem {
  ticker: string;
  articleHash: string;
  sentiment: SentimentData;
  analyzedAt: number;
  ttl: number;
}

/**
 * Get sentiment analysis for a specific ticker and article hash
 *
 * @param ticker - Stock ticker symbol
 * @param articleHash - Unique hash of the article
 * @returns Sentiment cache item or null if not found
 *
 * @example
 * const sentiment = await getSentiment('AAPL', 'hash_12345');
 */
export async function getSentiment(
  ticker: string,
  articleHash: string
): Promise<SentimentCacheItem | null> {
  try {
    const command = new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        ticker: ticker.toUpperCase(),
        articleHash,
      },
    });

    const response = await dynamoDb.send(command);

    if (!response.Item) {
      return null;
    }

    return response.Item as SentimentCacheItem;
  } catch (error) {
    console.error('[SentimentCacheRepository] Error getting sentiment:', error, {
      ticker,
      articleHash,
    });
    throw error;
  }
}

/**
 * Cache sentiment analysis result
 * Automatically sets TTL to 90 days from now
 *
 * @param item - Sentiment cache item to store
 *
 * @example
 * await putSentiment({
 *   ticker: 'AAPL',
 *   articleHash: 'hash_12345',
 *   sentiment: {
 *     positive: 15,
 *     negative: 3,
 *     sentimentScore: 0.67,
 *     classification: 'POS'
 *   },
 *   analyzedAt: Date.now()
 * });
 */
export async function putSentiment(
  item: Omit<SentimentCacheItem, 'ttl'>
): Promise<void> {
  try {
    const sentimentItem: SentimentCacheItem = {
      ...item,
      ticker: item.ticker.toUpperCase(),
      ttl: calculateTTL(90), // 90 days expiration (sentiment is timeless)
      analyzedAt: item.analyzedAt || Date.now(),
    };

    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: sentimentItem,
      // Prevent duplicate sentiment analysis
      ConditionExpression: 'attribute_not_exists(articleHash)',
    });

    await dynamoDb.send(command);
  } catch (error) {
    // ConditionalCheckFailedException means sentiment already exists - this is OK
    if ((error as any).name === 'ConditionalCheckFailedException') {
      console.log('[SentimentCacheRepository] Sentiment already exists (duplicate prevented):', {
        ticker: item.ticker,
        articleHash: item.articleHash,
      });
      return; // Don't throw error for duplicates
    }

    console.error('[SentimentCacheRepository] Error putting sentiment:', error, {
      ticker: item.ticker,
      articleHash: item.articleHash,
    });
    throw error;
  }
}

/**
 * Batch put sentiment analysis results
 * Handles chunking for DynamoDB's 25-item limit
 *
 * **IMPORTANT: Duplicate Prevention Limitation**
 * Unlike `putSentiment`, this function does NOT prevent duplicates because DynamoDB's
 * BatchWriteItem operation does not support ConditionExpression. Existing items with
 * the same keys will be silently overwritten.
 *
 * **Recommendations for Duplicate Prevention:**
 * 1. Pre-filter items: Use `existsInCache` or BatchGetItem to check for existing keys
 *    and filter them out before calling this function
 * 2. Use individual puts: For critical use cases requiring duplicate prevention, use
 *    `putSentiment` in a loop (with appropriate parallelism/retries)
 *
 * **Trade-offs:**
 * - Pre-filtering adds extra read capacity cost but prevents overwrites
 * - Individual puts increase latency but provide conditional write guarantees
 * - Batch writes are fastest but may overwrite existing data
 *
 * @param items - Array of sentiment cache items to store
 *
 * @example
 * await batchPutSentiments([
 *   { ticker: 'AAPL', articleHash: 'hash_1', sentiment: {...}, analyzedAt: Date.now() },
 *   { ticker: 'AAPL', articleHash: 'hash_2', sentiment: {...}, analyzedAt: Date.now() }
 * ]);
 */
export async function batchPutSentiments(
  items: Omit<SentimentCacheItem, 'ttl'>[]
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  try {
    const sentimentItems: SentimentCacheItem[] = items.map((item) => ({
      ...item,
      ticker: item.ticker.toUpperCase(),
      ttl: calculateTTL(90),
      analyzedAt: item.analyzedAt || Date.now(),
    }));

    await batchPutItems(TABLE_NAME, sentimentItems);
  } catch (error) {
    console.error('[SentimentCacheRepository] Error batch putting sentiments:', error, {
      itemCount: items.length,
    });
    throw error;
  }
}

/**
 * Query all sentiments for a specific ticker
 *
 * @param ticker - Stock ticker symbol
 * @returns Array of sentiment cache items for the ticker
 *
 * @example
 * const sentiments = await querySentimentsByTicker('AAPL');
 */
export async function querySentimentsByTicker(
  ticker: string
): Promise<SentimentCacheItem[]> {
  try {
    const command = new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: '#ticker = :ticker',
      ExpressionAttributeNames: {
        '#ticker': 'ticker',
      },
      ExpressionAttributeValues: {
        ':ticker': ticker.toUpperCase(),
      },
    });

    const response = await dynamoDb.send(command);

    return (response.Items as SentimentCacheItem[]) || [];
  } catch (error) {
    console.error('[SentimentCacheRepository] Error querying sentiments by ticker:', error, {
      ticker,
    });
    throw error;
  }
}

/**
 * Check if sentiment analysis exists in cache
 * Used for duplicate detection before analyzing
 *
 * @param ticker - Stock ticker symbol
 * @param articleHash - Unique hash of the article
 * @returns true if sentiment exists, false otherwise
 *
 * @example
 * const exists = await existsInCache('AAPL', 'hash_12345');
 */
export async function existsInCache(
  ticker: string,
  articleHash: string
): Promise<boolean> {
  try {
    const sentiment = await getSentiment(ticker, articleHash);
    return sentiment !== null;
  } catch (error) {
    console.error('[SentimentCacheRepository] Error checking if sentiment exists:', error, {
      ticker,
      articleHash,
    });
    throw error;
  }
}
