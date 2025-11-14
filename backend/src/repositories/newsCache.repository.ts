/**
 * NewsCache Repository
 *
 * Provides CRUD operations for news article data in DynamoDB cache
 */

import {
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { dynamoDb, batchPutItems } from '../utils/dynamodb.util.js';
import { calculateTTL } from '../utils/cache.util.js';

const TABLE_NAME = process.env.NEWS_CACHE_TABLE || 'NewsCache';

/**
 * News article interface
 */
export interface NewsArticle {
  title: string;
  url: string;
  description?: string;
  date: string;
  publisher?: string;
  imageUrl?: string;
}

/**
 * News cache item interface
 */
export interface NewsCacheItem {
  ticker: string;
  articleHash: string;
  article: NewsArticle;
  ttl: number;
  fetchedAt: number;
}

/**
 * Get news article for a specific ticker and article hash
 *
 * @param ticker - Stock ticker symbol
 * @param articleHash - Unique hash of the article
 * @returns News cache item or null if not found
 *
 * @example
 * const article = await getArticle('AAPL', 'hash_12345');
 */
export async function getArticle(
  ticker: string,
  articleHash: string
): Promise<NewsCacheItem | null> {
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

    return response.Item as NewsCacheItem;
  } catch (error) {
    console.error('[NewsCacheRepository] Error getting article:', error, { ticker, articleHash });
    throw error;
  }
}

/**
 * Cache news article
 * Automatically sets TTL to 30 days from now
 *
 * @param item - News cache item to store
 *
 * @example
 * await putArticle({
 *   ticker: 'AAPL',
 *   articleHash: 'hash_12345',
 *   article: {
 *     title: 'Apple announces new product',
 *     url: 'https://example.com/article',
 *     date: '2025-01-15',
 *     publisher: 'Tech News'
 *   },
 *   fetchedAt: Date.now()
 * });
 */
export async function putArticle(item: Omit<NewsCacheItem, 'ttl'>): Promise<void> {
  try {
    const newsItem: NewsCacheItem = {
      ...item,
      ticker: item.ticker.toUpperCase(),
      ttl: calculateTTL(30), // 30 days expiration
      fetchedAt: item.fetchedAt || Date.now(),
    };

    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: newsItem,
      // Prevent duplicate articles with conditional expression
      ConditionExpression: 'attribute_not_exists(articleHash)',
    });

    await dynamoDb.send(command);
  } catch (error) {
    // ConditionalCheckFailedException means article already exists - this is OK
    if ((error as any).name === 'ConditionalCheckFailedException') {
      console.log('[NewsCacheRepository] Article already exists (duplicate prevented):', {
        ticker: item.ticker,
        articleHash: item.articleHash,
      });
      return; // Don't throw error for duplicates
    }

    console.error('[NewsCacheRepository] Error putting article:', error, {
      ticker: item.ticker,
      articleHash: item.articleHash,
    });
    throw error;
  }
}

/**
 * Batch put news articles
 * Handles chunking for DynamoDB's 25-item limit
 *
 * **IMPORTANT: Duplicate Prevention Limitation**
 * Unlike `putArticle`, this function does NOT prevent duplicates because DynamoDB's
 * BatchWriteItem operation does not support ConditionExpression. Existing items with
 * the same keys will be silently overwritten.
 *
 * **Recommendations for Duplicate Prevention:**
 * 1. Pre-filter items: Use `existsInCache` or BatchGetItem to check for existing keys
 *    and filter them out before calling this function
 * 2. Use individual puts: For critical use cases requiring duplicate prevention, use
 *    `putArticle` in a loop (with appropriate parallelism/retries)
 *
 * **Trade-offs:**
 * - Pre-filtering adds extra read capacity cost but prevents overwrites
 * - Individual puts increase latency but provide conditional write guarantees
 * - Batch writes are fastest but may overwrite existing data
 *
 * @param items - Array of news cache items to store
 *
 * @example
 * await batchPutArticles([
 *   { ticker: 'AAPL', articleHash: 'hash_1', article: {...}, fetchedAt: Date.now() },
 *   { ticker: 'AAPL', articleHash: 'hash_2', article: {...}, fetchedAt: Date.now() }
 * ]);
 */
export async function batchPutArticles(
  items: Omit<NewsCacheItem, 'ttl'>[]
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  try {
    const newsItems: NewsCacheItem[] = items.map((item) => ({
      ...item,
      ticker: item.ticker.toUpperCase(),
      ttl: calculateTTL(30),
      fetchedAt: item.fetchedAt || Date.now(),
    }));

    await batchPutItems(TABLE_NAME, newsItems);
  } catch (error) {
    console.error('[NewsCacheRepository] Error batch putting articles:', error, {
      itemCount: items.length,
    });
    throw error;
  }
}

/**
 * Query all articles for a specific ticker
 *
 * @param ticker - Stock ticker symbol
 * @returns Array of news cache items for the ticker
 *
 * @example
 * const articles = await queryArticlesByTicker('AAPL');
 */
export async function queryArticlesByTicker(
  ticker: string
): Promise<NewsCacheItem[]> {
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

    return (response.Items as NewsCacheItem[]) || [];
  } catch (error) {
    console.error('[NewsCacheRepository] Error querying articles by ticker:', error, {
      ticker,
    });
    throw error;
  }
}

/**
 * Check if an article exists in cache
 * Used for duplicate detection before inserting
 *
 * @param ticker - Stock ticker symbol
 * @param articleHash - Unique hash of the article
 * @returns true if article exists, false otherwise
 *
 * @example
 * const exists = await existsInCache('AAPL', 'hash_12345');
 */
export async function existsInCache(
  ticker: string,
  articleHash: string
): Promise<boolean> {
  try {
    const article = await getArticle(ticker, articleHash);
    return article !== null;
  } catch (error) {
    console.error('[NewsCacheRepository] Error checking if article exists:', error, {
      ticker,
      articleHash,
    });
    throw error;
  }
}
