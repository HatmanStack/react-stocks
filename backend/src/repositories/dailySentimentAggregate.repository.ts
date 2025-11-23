import {
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { dynamoDb } from '../utils/dynamodb.util';
import type { DailySentimentAggregateItem } from '../types/dynamodb.types';

const TABLE_NAME = process.env.DAILY_SENTIMENT_TABLE || 'DailySentimentAggregate';

/**
 * Put daily sentiment aggregate (including predictions)
 */
export async function putDailyAggregate(item: DailySentimentAggregateItem): Promise<void> {
  try {
    // Normalize ticker to uppercase to match read operations
    const normalizedItem = {
      ...item,
      ticker: item.ticker?.toUpperCase() || item.ticker
    };

    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: normalizedItem
    });
    await dynamoDb.send(command);
  } catch (error) {
    console.error('[DailySentimentAggregateRepository] Error putting item:', error);
    throw error;
  }
}

/**
 * Get daily sentiment aggregate for a specific date
 */
export async function getDailyAggregate(ticker: string, date: string): Promise<DailySentimentAggregateItem | null> {
  try {
    const command = new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        ticker: ticker.toUpperCase(),
        date
      }
    });
    const response = await dynamoDb.send(command);
    return (response.Item as DailySentimentAggregateItem) || null;
  } catch (error) {
    console.error('[DailySentimentAggregateRepository] Error getting item:', error);
    throw error;
  }
}

/**
 * Get latest daily sentiment aggregate for a ticker
 * Used to fetch the latest prediction
 */
export async function getLatestDailyAggregate(ticker: string): Promise<DailySentimentAggregateItem | null> {
  try {
    const command = new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'ticker = :ticker',
      ExpressionAttributeValues: {
        ':ticker': ticker.toUpperCase()
      },
      ScanIndexForward: false, // Descending order
      Limit: 1
    });
    const response = await dynamoDb.send(command);
    if (response.Items && response.Items.length > 0) {
      return response.Items[0] as DailySentimentAggregateItem;
    }
    return null;
  } catch (error) {
    console.error('[DailySentimentAggregateRepository] Error getting latest item:', error);
    throw error;
  }
}
