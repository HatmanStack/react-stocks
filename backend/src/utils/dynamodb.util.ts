/**
 * DynamoDB Utility Functions
 *
 * Provides reusable utilities for DynamoDB operations including
 * update expression building, batch operations, retry logic, and
 * single-table design helpers.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
  BatchGetCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import type {
  GetCommandInput,
  PutCommandInput,
  QueryCommandInput,
  DeleteCommandInput,
  UpdateCommandInput,
  BatchGetCommandInput,
  BatchWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';

// Initialize DynamoDB client (reused across Lambda invocations)
const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Create document client with marshalling options
export const dynamoDb = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: false,
  },
  unmarshallOptions: {
    wrapNumbers: false,
  },
});

// Alias for backward compatibility
export const docClient = dynamoDb;

// ============================================================
// Single-Table Design Helpers
// ============================================================

/**
 * Get the unified table name from environment.
 *
 * Uses DYNAMODB_TABLE_NAME env var, falling back to stack-based naming.
 */
export function getTableName(): string {
  const tableName = process.env.DYNAMODB_TABLE_NAME;
  if (!tableName) {
    throw new Error('DYNAMODB_TABLE_NAME environment variable not set');
  }
  return tableName;
}

/**
 * Get a single item by PK and SK
 */
export async function getItem<T>(
  pk: string,
  sk: string,
): Promise<T | null> {
  const params: GetCommandInput = {
    TableName: getTableName(),
    Key: { pk, sk },
  };

  const result = await dynamoDb.send(new GetCommand(params));
  return (result.Item as T) ?? null;
}

/**
 * Put a single item
 */
export async function putItem<T extends { pk: string; sk: string; createdAt?: string }>(
  item: T,
): Promise<void> {
  const now = new Date().toISOString();
  const params: PutCommandInput = {
    TableName: getTableName(),
    Item: {
      ...item,
      updatedAt: now,
      createdAt: item.createdAt ?? now,
    },
  };

  await dynamoDb.send(new PutCommand(params));
}

/**
 * Put a single item with conditional expression (for duplicate prevention)
 */
export async function putItemConditional<T extends { pk: string; sk: string; createdAt?: string }>(
  item: T,
  conditionExpression: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const params: PutCommandInput = {
    TableName: getTableName(),
    Item: {
      ...item,
      updatedAt: now,
      createdAt: item.createdAt ?? now,
    },
    ConditionExpression: conditionExpression,
  };

  try {
    await dynamoDb.send(new PutCommand(params));
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
      return false; // Item already exists
    }
    throw error;
  }
}

/**
 * Query items by PK with optional SK conditions
 */
export async function queryItems<T>(
  pk: string,
  options?: {
    skPrefix?: string;
    skBetween?: { start: string; end: string };
    limit?: number;
    scanIndexForward?: boolean;
  },
): Promise<T[]> {
  let keyConditionExpression = 'pk = :pk';
  const expressionAttributeValues: Record<string, unknown> = { ':pk': pk };

  if (options?.skPrefix) {
    keyConditionExpression += ' AND begins_with(sk, :skPrefix)';
    expressionAttributeValues[':skPrefix'] = options.skPrefix;
  } else if (options?.skBetween) {
    keyConditionExpression += ' AND sk BETWEEN :skStart AND :skEnd';
    expressionAttributeValues[':skStart'] = options.skBetween.start;
    expressionAttributeValues[':skEnd'] = options.skBetween.end;
  }

  const params: QueryCommandInput = {
    TableName: getTableName(),
    KeyConditionExpression: keyConditionExpression,
    ExpressionAttributeValues: expressionAttributeValues,
    Limit: options?.limit,
    ScanIndexForward: options?.scanIndexForward ?? true,
  };

  const result = await dynamoDb.send(new QueryCommand(params));
  return (result.Items as T[]) ?? [];
}

/**
 * Delete a single item
 */
export async function deleteItem(pk: string, sk: string): Promise<void> {
  const params: DeleteCommandInput = {
    TableName: getTableName(),
    Key: { pk, sk },
  };

  await dynamoDb.send(new DeleteCommand(params));
}

/**
 * Batch get items for single-table design (max 100 per call)
 */
export async function batchGetItemsSingleTable<T>(
  keys: Array<{ pk: string; sk: string }>,
): Promise<T[]> {
  if (keys.length === 0) return [];
  if (keys.length > 100) {
    throw new Error('batchGetItemsSingleTable supports max 100 keys');
  }

  const tableName = getTableName();
  const params: BatchGetCommandInput = {
    RequestItems: {
      [tableName]: {
        Keys: keys,
      },
    },
  };

  const result = await dynamoDb.send(new BatchGetCommand(params));
  return (result.Responses?.[tableName] as T[]) ?? [];
}

/**
 * Batch put items for single-table design (max 25 per call)
 */
export async function batchPutItemsSingleTable<T extends { pk: string; sk: string; createdAt?: string }>(
  items: T[],
): Promise<void> {
  if (items.length === 0) return;
  if (items.length > 25) {
    throw new Error('batchPutItemsSingleTable supports max 25 items');
  }

  const tableName = getTableName();
  const now = new Date().toISOString();

  const params: BatchWriteCommandInput = {
    RequestItems: {
      [tableName]: items.map((item) => ({
        PutRequest: {
          Item: {
            ...item,
            updatedAt: now,
            createdAt: item.createdAt ?? now,
          },
        },
      })),
    },
  };

  await dynamoDb.send(new BatchWriteCommand(params));
}

/**
 * Update specific attributes of an item
 */
export async function updateItem(
  pk: string,
  sk: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const updateParts: string[] = ['#updatedAt = :updatedAt'];
  const expressionAttributeValues: Record<string, unknown> = {
    ':updatedAt': new Date().toISOString(),
  };
  const expressionAttributeNames: Record<string, string> = {
    '#updatedAt': 'updatedAt',
  };

  for (const [key, value] of Object.entries(updates)) {
    const attrName = `#${key}`;
    const attrValue = `:${key}`;
    expressionAttributeNames[attrName] = key;
    expressionAttributeValues[attrValue] = value;
    updateParts.push(`${attrName} = ${attrValue}`);
  }

  const params: UpdateCommandInput = {
    TableName: getTableName(),
    Key: { pk, sk },
    UpdateExpression: 'SET ' + updateParts.join(', '),
    ExpressionAttributeValues: expressionAttributeValues,
    ExpressionAttributeNames: expressionAttributeNames,
  };

  await dynamoDb.send(new UpdateCommand(params));
}

// ============================================================
// Legacy Multi-Table Helpers (for backward compatibility)
// ============================================================

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
export function buildUpdateExpression(updates: Record<string, unknown>): {
  UpdateExpression: string;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues: Record<string, unknown>;
} {
  const keys = Object.keys(updates);

  if (keys.length === 0) {
    throw new Error('Updates object cannot be empty');
  }

  const setExpressions: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, unknown> = {};

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
export async function batchGetItems<T = unknown, K extends object = Record<string, unknown>>(
  tableName: string,
  keys: K[]
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
      const unprocessedKeys = response.UnprocessedKeys[tableName]?.Keys || [];
      if (unprocessedKeys.length > 0) {
        const retryResults = await batchGetItems<T>(tableName, unprocessedKeys as Record<string, unknown>[]);
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
export async function batchPutItems<T extends object>(
  tableName: string,
  items: T[]
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
      const validItems = unprocessedItems.filter((item): item is Record<string, unknown> => item !== undefined);

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
      const errorName = (error as { name?: string }).name || '';
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
