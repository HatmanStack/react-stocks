/**
 * DynamoDB Utility Functions
 *
 * Provides reusable utilities for DynamoDB operations including
 * update expression building, batch operations, and retry logic.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  BatchGetCommand,
  BatchWriteCommand,
  BatchGetCommandInput,
  BatchWriteCommandInput
} from '@aws-sdk/lib-dynamodb';

// Initialize DynamoDB client (reused across Lambda invocations)
const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
export const dynamoDb = DynamoDBDocumentClient.from(client);

/**
 * Build DynamoDB UpdateExpression from an object of updates
 *
 * @param updates - Object containing field names and values to update
 * @returns UpdateExpression, ExpressionAttributeNames, and ExpressionAttributeValues
 *
 * @example
 * const result = buildUpdateExpression({ status: 'COMPLETED', completedAt: 1234567890 });
 * // Returns: {
 * //   UpdateExpression: 'SET #status = :status, #completedAt = :completedAt',
 * //   ExpressionAttributeNames: { '#status': 'status', '#completedAt': 'completedAt' },
 * //   ExpressionAttributeValues: { ':status': 'COMPLETED', ':completedAt': 1234567890 }
 * // }
 */
export function buildUpdateExpression(updates: Record<string, any>): {
  UpdateExpression: string;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues: Record<string, any>;
} {
  const keys = Object.keys(updates);

  if (keys.length === 0) {
    throw new Error('Updates object cannot be empty');
  }

  const setExpressions: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, any> = {};

  keys.forEach((key) => {
    const attributeName = `#${key}`;
    const attributeValue = `:${key}`;

    setExpressions.push(`${attributeName} = ${attributeValue}`);
    expressionAttributeNames[attributeName] = key;
    expressionAttributeValues[attributeValue] = updates[key];
  });

  return {
    UpdateExpression: `SET ${setExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
  };
}

/**
 * Batch get items from DynamoDB with automatic pagination
 * Handles DynamoDB limit of 100 items per request
 *
 * @param tableName - Name of the DynamoDB table
 * @param keys - Array of key objects to retrieve
 * @returns Array of retrieved items
 *
 * @example
 * const items = await batchGetItems('MyTable', [
 *   { ticker: 'AAPL', date: '2025-01-01' },
 *   { ticker: 'GOOGL', date: '2025-01-01' }
 * ]);
 */
export async function batchGetItems<T = any>(
  tableName: string,
  keys: Record<string, any>[]
): Promise<T[]> {
  if (keys.length === 0) {
    return [];
  }

  const results: T[] = [];
  const batchSize = 100; // DynamoDB limit

  // Process in chunks of 100
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);

    const params: BatchGetCommandInput = {
      RequestItems: {
        [tableName]: {
          Keys: batch,
        },
      },
    };

    const command = new BatchGetCommand(params);
    const response = await dynamoDb.send(command);

    if (response.Responses && response.Responses[tableName]) {
      results.push(...(response.Responses[tableName] as T[]));
    }

    // Handle unprocessed keys (retry)
    if (response.UnprocessedKeys && Object.keys(response.UnprocessedKeys).length > 0) {
      console.warn('[DynamoDB] Unprocessed keys detected, retrying...', response.UnprocessedKeys);
      // Recursively process unprocessed keys
      const unprocessedKeys = response.UnprocessedKeys[tableName]?.Keys || [];
      if (unprocessedKeys.length > 0) {
        const retryResults = await batchGetItems<T>(tableName, unprocessedKeys);
        results.push(...retryResults);
      }
    }
  }

  return results;
}

/**
 * Batch put items to DynamoDB with automatic batching
 * Handles DynamoDB limit of 25 items per request
 *
 * @param tableName - Name of the DynamoDB table
 * @param items - Array of items to put
 *
 * @example
 * await batchPutItems('MyTable', [
 *   { ticker: 'AAPL', date: '2025-01-01', price: 150 },
 *   { ticker: 'GOOGL', date: '2025-01-01', price: 2800 }
 * ]);
 */
export async function batchPutItems(
  tableName: string,
  items: Record<string, any>[]
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const batchSize = 25; // DynamoDB BatchWriteItem limit

  // Process in chunks of 25
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    const params: BatchWriteCommandInput = {
      RequestItems: {
        [tableName]: batch.map((item) => ({
          PutRequest: {
            Item: item,
          },
        })),
      },
    };

    const command = new BatchWriteCommand(params);
    const response = await dynamoDb.send(command);

    // Handle unprocessed items (retry)
    if (response.UnprocessedItems && Object.keys(response.UnprocessedItems).length > 0) {
      console.warn('[DynamoDB] Unprocessed items detected, retrying...', response.UnprocessedItems);
      const unprocessedItems = response.UnprocessedItems[tableName]?.map((req) => req.PutRequest?.Item) || [];
      const validItems = unprocessedItems.filter((item): item is Record<string, any> => item !== undefined);

      if (validItems.length > 0) {
        await batchPutItems(tableName, validItems);
      }
    }
  }
}

/**
 * Retry a function with exponential backoff
 * Useful for handling throttling errors from DynamoDB
 *
 * @param fn - Async function to retry
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param baseDelayMs - Base delay in milliseconds (default: 100)
 * @returns Result of the function
 *
 * @example
 * const result = await withRetry(
 *   async () => await dynamoDb.send(new GetItemCommand(params)),
 *   3
 * );
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 100
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if error is retryable
      const errorName = (error as any).name || '';
      const isRetryable =
        errorName === 'ProvisionedThroughputExceededException' ||
        errorName === 'RequestLimitExceeded' ||
        errorName === 'ThrottlingException' ||
        errorName === 'InternalServerError';

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff: 100ms, 200ms, 400ms, 800ms...
      const delayMs = baseDelayMs * Math.pow(2, attempt);
      console.warn(`[DynamoDB] Retry attempt ${attempt + 1}/${maxRetries} after ${delayMs}ms due to ${errorName}`);

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
