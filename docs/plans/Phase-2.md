# Phase 2: DynamoDB Single-Table Migration + Circuit Breaker Persistence

## Phase Goal

Consolidate 7 DynamoDB tables into a true single-table design using composite keys. Persist circuit breaker state to DynamoDB to survive Lambda cold starts. This is the largest change in this plan.

**Success Criteria:**
- All 7 tables consolidated into 1 table with composite keys
- All existing access patterns maintained
- TTL behavior preserved per entity type
- Circuit breaker state survives Lambda cold starts
- All tests pass
- Deploy succeeds without data loss (old tables remain until TTL)

**Estimated Tokens:** ~50,000

**Note on Phase Size:** This phase is large (12 tasks). If implementation reveals additional complexity, consider splitting into:
- Phase 2A: Tasks 1-6 (type definitions, utilities, repository refactoring)
- Phase 2B: Tasks 7-12 (circuit breaker, SAM template, testing)

---

## Prerequisites

- Phase 1 completed (constants centralized, including CIRCUIT_* constants)
- `npm run check` passes
- Backup/snapshot of production DynamoDB tables (if applicable)
- Understanding of Phase 0 ADR-003 (single-table key design)

---

## Single-Table Key Design Reference

| Entity | PK | SK | TTL | Example |
|--------|----|----|-----|---------|
| Stock Cache | `STOCK#AAPL` | `DATE#2024-01-15` | 1-90 days | Price data |
| News Cache | `NEWS#AAPL` | `HASH#abc123` | 7 days | Article metadata |
| Sentiment Cache | `SENT#AAPL` | `HASH#abc123` | 30 days | Article sentiment |
| Sentiment Job | `JOB#ticker_start_end` | `META` | 1 day | Job status |
| Stock Historical | `HIST#AAPL` | `DATE#2024-01-15` | None | ML training data |
| Article Analysis | `ARTICLE#AAPL` | `HASH#abc123#DATE#2024-01-15` | None | ML article data |
| Daily Aggregate | `DAILY#AAPL` | `DATE#2024-01-15` | None | Daily sentiment |
| Circuit Breaker | `CIRCUIT#mlsentiment` | `STATE` | None | Service health |

---

## Task 1: Extend Single Table Type Definitions

**Goal:** Extend the existing dynamodb.types.ts with new single-table key structure types.

**Files to Modify:**
- `backend/src/types/dynamodb.types.ts`

**Existing Types to Preserve:**
The file currently contains 3 interfaces that should be preserved and extended:
- `StockHistoricalDataItem` - historical price data
- `ArticleAnalysisDataItem` - article analysis data
- `DailySentimentAggregateItem` - daily sentiment aggregates

**Implementation Steps:**

1. Extend `backend/src/types/dynamodb.types.ts` (preserving existing types):
   ```typescript
   /**
    * DynamoDB Single-Table Type Definitions
    *
    * Defines the key structure and entity types for the consolidated table.
    * See Phase 0 ADR-003 for design rationale.
    */

   /**
    * Entity type prefixes for partition keys
    */
   export const EntityPrefix = {
     STOCK: 'STOCK',      // Stock price cache
     NEWS: 'NEWS',        // News article cache
     SENTIMENT: 'SENT',   // Sentiment analysis cache
     JOB: 'JOB',          // Sentiment job status
     HISTORICAL: 'HIST',  // Historical price data (ML)
     ARTICLE: 'ARTICLE',  // Article analysis data (ML)
     DAILY: 'DAILY',      // Daily sentiment aggregate
     CIRCUIT: 'CIRCUIT',  // Circuit breaker state
   } as const;

   export type EntityPrefixType = typeof EntityPrefix[keyof typeof EntityPrefix];

   /**
    * Sort key prefixes
    */
   export const SortKeyPrefix = {
     DATE: 'DATE',
     HASH: 'HASH',
     META: 'META',
     STATE: 'STATE',
   } as const;

   /**
    * Base interface for all table items
    */
   export interface BaseTableItem {
     pk: string;
     sk: string;
     ttl?: number;
     createdAt: string;
     updatedAt: string;
   }

   /**
    * Stock cache item
    * PK: STOCK#AAPL, SK: DATE#2024-01-15
    */
   export interface StockCacheItem extends BaseTableItem {
     entityType: 'STOCK';
     ticker: string;
     date: string;
     open: number;
     high: number;
     low: number;
     close: number;
     volume: number;
   }

   /**
    * News cache item
    * PK: NEWS#AAPL, SK: HASH#abc123
    */
   export interface NewsCacheItem extends BaseTableItem {
     entityType: 'NEWS';
     ticker: string;
     articleHash: string;
     headline: string;
     summary: string;
     source: string;
     url: string;
     publishedAt: string;
   }

   /**
    * Sentiment cache item
    * PK: SENT#AAPL, SK: HASH#abc123
    */
   export interface SentimentCacheItem extends BaseTableItem {
     entityType: 'SENTIMENT';
     ticker: string;
     articleHash: string;
     headline: string;
     summary: string;
     publishedAt: string;
     // Legacy fields
     positive?: number;
     negative?: number;
     neutral?: number;
     // Phase 5 fields
     eventType?: string;
     eventConfidence?: number;
     aspectScore?: number;
     mlScore?: number;
     signalScore?: number;
   }

   /**
    * Sentiment job item
    * PK: JOB#AAPL_2024-01-01_2024-01-31, SK: META
    */
   export interface SentimentJobItem extends BaseTableItem {
     entityType: 'JOB';
     jobId: string;
     ticker: string;
     startDate: string;
     endDate: string;
     status: 'pending' | 'processing' | 'completed' | 'failed';
     progress?: number;
     articlesProcessed?: number;
     articlesTotal?: number;
     error?: string;
   }

   /**
    * Historical stock data item (ML training)
    * PK: HIST#AAPL, SK: DATE#2024-01-15
    */
   export interface StockHistoricalItem extends BaseTableItem {
     entityType: 'HISTORICAL';
     ticker: string;
     date: string;
     open: number;
     high: number;
     low: number;
     close: number;
     volume: number;
     adjClose?: number;
   }

   /**
    * Article analysis item (ML training)
    * PK: ARTICLE#AAPL, SK: HASH#abc123#DATE#2024-01-15
    */
   export interface ArticleAnalysisItem extends BaseTableItem {
     entityType: 'ARTICLE';
     ticker: string;
     articleHash: string;
     date: string;
     headline: string;
     eventType: string;
     eventConfidence: number;
     aspectScore: number;
     mlScore?: number;
     signalScore: number;
   }

   /**
    * Daily sentiment aggregate item
    * PK: DAILY#AAPL, SK: DATE#2024-01-15
    */
   export interface DailySentimentItem extends BaseTableItem {
     entityType: 'DAILY';
     ticker: string;
     date: string;
     articleCount: number;
     positiveCount: number;
     negativeCount: number;
     neutralCount: number;
     avgAspectScore: number;
     avgMlScore?: number;
     avgSignalScore: number;
     eventCounts: string; // JSON stringified
   }

   /**
    * Circuit breaker state item
    * PK: CIRCUIT#mlsentiment, SK: STATE
    */
   export interface CircuitBreakerItem extends BaseTableItem {
     entityType: 'CIRCUIT';
     serviceName: string;
     consecutiveFailures: number;
     circuitOpenUntil: number; // Unix timestamp ms
     lastFailure?: string;
     lastSuccess?: string;
   }

   /**
    * Union type of all table items
    */
   export type TableItem =
     | StockCacheItem
     | NewsCacheItem
     | SentimentCacheItem
     | SentimentJobItem
     | StockHistoricalItem
     | ArticleAnalysisItem
     | DailySentimentItem
     | CircuitBreakerItem;

   /**
    * Helper functions for key construction
    */
   export function makeStockPK(ticker: string): string {
     return `${EntityPrefix.STOCK}#${ticker.toUpperCase()}`;
   }

   export function makeDateSK(date: string): string {
     return `${SortKeyPrefix.DATE}#${date}`;
   }

   export function makeNewsPK(ticker: string): string {
     return `${EntityPrefix.NEWS}#${ticker.toUpperCase()}`;
   }

   export function makeHashSK(hash: string): string {
     return `${SortKeyPrefix.HASH}#${hash}`;
   }

   export function makeSentimentPK(ticker: string): string {
     return `${EntityPrefix.SENTIMENT}#${ticker.toUpperCase()}`;
   }

   export function makeJobPK(jobId: string): string {
     return `${EntityPrefix.JOB}#${jobId}`;
   }

   export function makeHistoricalPK(ticker: string): string {
     return `${EntityPrefix.HISTORICAL}#${ticker.toUpperCase()}`;
   }

   export function makeArticlePK(ticker: string): string {
     return `${EntityPrefix.ARTICLE}#${ticker.toUpperCase()}`;
   }

   export function makeArticleSK(hash: string, date: string): string {
     return `${SortKeyPrefix.HASH}#${hash}#${SortKeyPrefix.DATE}#${date}`;
   }

   export function makeDailyPK(ticker: string): string {
     return `${EntityPrefix.DAILY}#${ticker.toUpperCase()}`;
   }

   export function makeCircuitPK(serviceName: string): string {
     return `${EntityPrefix.CIRCUIT}#${serviceName}`;
   }

   export function makeStateSK(): string {
     return SortKeyPrefix.STATE;
   }
   ```

**Verification Checklist:**
- [x] All entity types defined with proper interfaces
- [x] Key construction helper functions created
- [x] TypeScript compilation succeeds
- [x] Exports are correct

**Testing Instructions:**
```bash
cd backend
npm run type-check
```

**Commit Message Template:**
```
feat(backend): add single-table DynamoDB type definitions

- Create dynamodb.types.ts with entity interfaces
- Define EntityPrefix and SortKeyPrefix constants
- Add key construction helper functions
- Support all 8 entity types including circuit breaker
```

---

## Task 2: Create DynamoDB Client Utility

**Goal:** Create a shared DynamoDB client utility that all repositories will use.

**Files to Create:**
- `backend/src/utils/dynamodb.util.ts`

**Implementation Steps:**

1. Create `backend/src/utils/dynamodb.util.ts`:
   ```typescript
   /**
    * DynamoDB Client Utility
    *
    * Shared DynamoDB DocumentClient for all repositories.
    * Uses single-table design with composite keys.
    */

   import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
   import {
     DynamoDBDocumentClient,
     GetCommand,
     PutCommand,
     QueryCommand,
     DeleteCommand,
     BatchGetCommand,
     BatchWriteCommand,
     UpdateCommand,
   } from '@aws-sdk/lib-dynamodb';
   import type { GetCommandInput, PutCommandInput, QueryCommandInput, DeleteCommandInput, BatchGetCommandInput, BatchWriteCommandInput, UpdateCommandInput } from '@aws-sdk/lib-dynamodb';

   // Create base DynamoDB client
   const client = new DynamoDBClient({});

   // Create document client with marshalling options
   export const docClient = DynamoDBDocumentClient.from(client, {
     marshallOptions: {
       removeUndefinedValues: true,
       convertEmptyValues: false,
     },
     unmarshallOptions: {
       wrapNumbers: false,
     },
   });

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

     const result = await docClient.send(new GetCommand(params));
     return (result.Item as T) ?? null;
   }

   /**
    * Put a single item
    */
   export async function putItem<T extends { pk: string; sk: string }>(
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

     await docClient.send(new PutCommand(params));
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

     const result = await docClient.send(new QueryCommand(params));
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

     await docClient.send(new DeleteCommand(params));
   }

   /**
    * Batch get items (max 100 per call)
    */
   export async function batchGetItems<T>(
     keys: Array<{ pk: string; sk: string }>,
   ): Promise<T[]> {
     if (keys.length === 0) return [];
     if (keys.length > 100) {
       throw new Error('batchGetItems supports max 100 keys');
     }

     const tableName = getTableName();
     const params: BatchGetCommandInput = {
       RequestItems: {
         [tableName]: {
           Keys: keys,
         },
       },
     };

     const result = await docClient.send(new BatchGetCommand(params));
     return (result.Responses?.[tableName] as T[]) ?? [];
   }

   /**
    * Batch write items (max 25 per call)
    */
   export async function batchPutItems<T extends { pk: string; sk: string }>(
     items: T[],
   ): Promise<void> {
     if (items.length === 0) return;
     if (items.length > 25) {
       throw new Error('batchPutItems supports max 25 items');
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

     await docClient.send(new BatchWriteCommand(params));
   }

   /**
    * Update specific attributes of an item
    */
   export async function updateItem(
     pk: string,
     sk: string,
     updates: Record<string, unknown>,
   ): Promise<void> {
     const updateParts: string[] = ['updatedAt = :updatedAt'];
     const expressionAttributeValues: Record<string, unknown> = {
       ':updatedAt': new Date().toISOString(),
     };
     const expressionAttributeNames: Record<string, string> = {};

     for (const [key, value] of Object.entries(updates)) {
       // Handle reserved words
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
       ExpressionAttributeNames:
         Object.keys(expressionAttributeNames).length > 0
           ? expressionAttributeNames
           : undefined,
     };

     await docClient.send(new UpdateCommand(params));
   }
   ```

**Verification Checklist:**
- [x] Client created with proper marshalling options
- [x] All CRUD helper functions implemented
- [x] Batch operations respect size limits
- [x] TypeScript compilation succeeds

**Testing Instructions:**
```bash
cd backend
npm run type-check
```

**Commit Message Template:**
```
feat(backend): add DynamoDB client utility for single-table

- Create shared DynamoDBDocumentClient instance
- Add getItem, putItem, queryItems, deleteItem helpers
- Add batchGetItems, batchPutItems with size validation
- Add updateItem for partial updates
```

---

## Task 3: Refactor News Cache Repository

**Goal:** Refactor newsCache.repository.ts to use the new single-table key structure.

**Files to Modify:**
- `backend/src/repositories/newsCache.repository.ts`

**Implementation Steps:**

1. Update imports to use new utilities:
   ```typescript
   import { getItem, putItem, queryItems, batchPutItems, batchGetItems } from '../utils/dynamodb.util.js';
   import { makeNewsPK, makeHashSK, type NewsCacheItem } from '../types/dynamodb.types.js';
   import { calculateTTLByDataType } from '../utils/cache.util.js';
   ```

2. Refactor `getNewsByHash`:
   ```typescript
   export async function getNewsByHash(
     ticker: string,
     articleHash: string,
   ): Promise<NewsCacheItem | null> {
     const pk = makeNewsPK(ticker);
     const sk = makeHashSK(articleHash);
     return getItem<NewsCacheItem>(pk, sk);
   }
   ```

3. Refactor `queryNewsByTicker`:
   ```typescript
   export async function queryNewsByTicker(
     ticker: string,
   ): Promise<NewsCacheItem[]> {
     const pk = makeNewsPK(ticker);
     return queryItems<NewsCacheItem>(pk, { skPrefix: 'HASH#' });
   }
   ```

4. Refactor `putNews`:
   ```typescript
   export async function putNews(item: {
     ticker: string;
     articleHash: string;
     headline: string;
     summary: string;
     source: string;
     url: string;
     publishedAt: string;
   }): Promise<void> {
     const pk = makeNewsPK(item.ticker);
     const sk = makeHashSK(item.articleHash);
     const ttl = calculateTTLByDataType('news');

     const cacheItem: NewsCacheItem = {
       pk,
       sk,
       entityType: 'NEWS',
       ticker: item.ticker.toUpperCase(),
       articleHash: item.articleHash,
       headline: item.headline,
       summary: item.summary,
       source: item.source,
       url: item.url,
       publishedAt: item.publishedAt,
       ttl,
       createdAt: new Date().toISOString(),
       updatedAt: new Date().toISOString(),
     };

     await putItem(cacheItem);
   }
   ```

5. Refactor batch operations similarly

6. Remove old table name references and DynamoDB client instantiation

**Verification Checklist:**
- [x] All functions use new key structure
- [x] TTL still applied correctly
- [x] No references to old table name
- [x] TypeScript compilation succeeds
- [ ] Unit tests created in Task 10 (repository tests don't exist yet)

**Testing Instructions:**
```bash
cd backend
npm run type-check
npm test -- --testPathPattern=newsCache
```

**Commit Message Template:**
```
refactor(backend): migrate newsCache repository to single-table

- Use makeNewsPK/makeHashSK for key construction
- Update all CRUD operations to use dynamodb.util helpers
- Remove direct DynamoDB client usage
- Maintain TTL behavior
```

---

## Task 4: Refactor Sentiment Cache Repository

**Goal:** Refactor sentimentCache.repository.ts to use the new single-table key structure.

**Files to Modify:**
- `backend/src/repositories/sentimentCache.repository.ts`

**Implementation Steps:**

1. Follow the same pattern as Task 3:
   - Update imports
   - Use `makeSentimentPK` and `makeHashSK`
   - Refactor all CRUD functions
   - Update batch operations
   - Remove old client code

2. Key mappings:
   - Old: `ticker (PK), articleHash (SK)` in SentimentCacheTable
   - New: `pk = SENT#AAPL, sk = HASH#abc123` in unified table

**Verification Checklist:**
- [x] All functions use new key structure
- [x] Phase 5 fields preserved (eventType, aspectScore, mlScore, signalScore)
- [x] TTL (30 days) still applied correctly
- [x] TypeScript compilation succeeds
- [ ] Unit tests created in Task 10 (repository tests don't exist yet)

**Testing Instructions:**
```bash
cd backend
npm run type-check
npm test -- --testPathPattern=sentimentCache
```

**Commit Message Template:**
```
refactor(backend): migrate sentimentCache repository to single-table

- Use makeSentimentPK/makeHashSK for key construction
- Preserve all Phase 5 sentiment fields
- Maintain 30-day TTL behavior
```

---

## Task 5: Refactor Sentiment Jobs Repository

**Goal:** Refactor sentimentJobs.repository.ts to use the new single-table key structure.

**Files to Modify:**
- `backend/src/repositories/sentimentJobs.repository.ts`

**Implementation Steps:**

1. Update key structure:
   - Old: `jobId (PK)` only
   - New: `pk = JOB#jobId, sk = META`

2. Refactor functions:
   ```typescript
   export async function getJob(jobId: string): Promise<SentimentJobItem | null> {
     const pk = makeJobPK(jobId);
     const sk = 'META';
     return getItem<SentimentJobItem>(pk, sk);
   }

   export async function createJob(job: {...}): Promise<void> {
     const pk = makeJobPK(job.jobId);
     const sk = 'META';
     const ttl = calculateTTLByDataType('job');
     // ... create item
   }
   ```

3. Update job ID generation to remain consistent

**Verification Checklist:**
- [ ] Job ID format unchanged
- [ ] TTL (1 day) still applied
- [ ] Status updates work correctly
- [ ] Idempotent creation preserved
- [ ] TypeScript compilation succeeds
- [ ] Unit tests created in Task 10 (repository tests don't exist yet)

**Testing Instructions:**
```bash
cd backend
npm run type-check
npm test -- --testPathPattern=sentimentJobs
```

**Commit Message Template:**
```
refactor(backend): migrate sentimentJobs repository to single-table

- Use makeJobPK with META sort key
- Preserve idempotent job creation
- Maintain 1-day TTL behavior
```

---

## Task 6: Refactor Daily Sentiment Aggregate Repository

**Goal:** Refactor dailySentimentAggregate.repository.ts to use the new single-table key structure.

**Files to Modify:**
- `backend/src/repositories/dailySentimentAggregate.repository.ts`

**Implementation Steps:**

1. Update key structure:
   - Old: `ticker (PK), date (SK)` in DailySentimentAggregate table
   - New: `pk = DAILY#AAPL, sk = DATE#2024-01-15`

2. Refactor query for date range:
   ```typescript
   export async function queryByTickerAndDateRange(
     ticker: string,
     startDate: string,
     endDate: string,
   ): Promise<DailySentimentItem[]> {
     const pk = makeDailyPK(ticker);
     return queryItems<DailySentimentItem>(pk, {
       skBetween: {
         start: makeDateSK(startDate),
         end: makeDateSK(endDate),
       },
     });
   }
   ```

3. Note: This table has NO TTL (persistent ML training data)

**Verification Checklist:**
- [ ] Date range queries work correctly
- [ ] No TTL (persistent data)
- [ ] Event counts JSON preserved
- [ ] TypeScript compilation succeeds
- [ ] Unit tests created in Task 10 (repository tests don't exist yet)

**Testing Instructions:**
```bash
cd backend
npm run type-check
npm test -- --testPathPattern=dailySentiment
```

**Commit Message Template:**
```
refactor(backend): migrate dailySentimentAggregate to single-table

- Use makeDailyPK/makeDateSK for key construction
- Maintain persistent storage (no TTL)
- Preserve date range query capability
```

---

## Task 7: Create Circuit Breaker Repository

**Goal:** Create a new repository for circuit breaker state persistence.

**Files to Create:**
- `backend/src/repositories/circuitBreaker.repository.ts`

**Implementation Steps:**

1. Create the repository:
   ```typescript
   /**
    * Circuit Breaker Repository
    *
    * Persists circuit breaker state to DynamoDB for cross-invocation survival.
    * See Phase 0 ADR-004 for design rationale.
    */

   import { getItem, putItem, updateItem } from '../utils/dynamodb.util.js';
   import { makeCircuitPK, makeStateSK, type CircuitBreakerItem } from '../types/dynamodb.types.js';

   const ML_SENTIMENT_SERVICE = 'mlsentiment';

   /**
    * Get circuit breaker state for ML sentiment service
    */
   export async function getCircuitState(): Promise<{
     consecutiveFailures: number;
     circuitOpenUntil: number;
   }> {
     const pk = makeCircuitPK(ML_SENTIMENT_SERVICE);
     const sk = makeStateSK();

     const item = await getItem<CircuitBreakerItem>(pk, sk);

     if (!item) {
       // Return default closed state if no record exists
       return {
         consecutiveFailures: 0,
         circuitOpenUntil: 0,
       };
     }

     return {
       consecutiveFailures: item.consecutiveFailures,
       circuitOpenUntil: item.circuitOpenUntil,
     };
   }

   /**
    * Update circuit breaker state after success or failure
    */
   export async function updateCircuitState(
     consecutiveFailures: number,
     circuitOpenUntil: number,
     event: 'success' | 'failure',
   ): Promise<void> {
     const pk = makeCircuitPK(ML_SENTIMENT_SERVICE);
     const sk = makeStateSK();
     const now = new Date().toISOString();

     const item: CircuitBreakerItem = {
       pk,
       sk,
       entityType: 'CIRCUIT',
       serviceName: ML_SENTIMENT_SERVICE,
       consecutiveFailures,
       circuitOpenUntil,
       lastSuccess: event === 'success' ? now : undefined,
       lastFailure: event === 'failure' ? now : undefined,
       createdAt: now,
       updatedAt: now,
     };

     await putItem(item);
   }

   /**
    * Record a successful ML sentiment call (reset circuit)
    */
   export async function recordSuccess(): Promise<void> {
     await updateCircuitState(0, 0, 'success');
   }

   /**
    * Record a failed ML sentiment call
    */
   export async function recordFailure(
     currentFailures: number,
     failureThreshold: number,
     cooldownMs: number,
   ): Promise<{ isOpen: boolean; openUntil: number }> {
     const newFailures = currentFailures + 1;
     let circuitOpenUntil = 0;

     if (newFailures >= failureThreshold) {
       circuitOpenUntil = Date.now() + cooldownMs;
       console.warn(
         `[CircuitBreaker] Circuit OPEN after ${failureThreshold} failures, cooldown ${cooldownMs}ms`,
       );
     }

     await updateCircuitState(newFailures, circuitOpenUntil, 'failure');

     return {
       isOpen: circuitOpenUntil > 0,
       openUntil: circuitOpenUntil,
     };
   }
   ```

2. Add to repository index exports

**Verification Checklist:**
- [ ] Get/update functions work correctly
- [ ] Default closed state returned when no record
- [ ] Failure threshold logic correct
- [ ] TypeScript compilation succeeds

**Testing Instructions:**
```bash
cd backend
npm run type-check
# Write unit tests in Task 10
```

**Commit Message Template:**
```
feat(backend): add circuit breaker repository

- Create circuitBreaker.repository.ts
- Persist state to DynamoDB single table
- Support get, recordSuccess, recordFailure operations
```

---

## Task 8: Refactor ML Sentiment Service

**Goal:** Update mlSentiment.service.ts to use the new circuit breaker repository instead of module-level variables.

**Files to Modify:**
- `backend/src/services/mlSentiment.service.ts`

**Implementation Steps:**

1. Remove module-level state variables:
   ```typescript
   // REMOVE these lines:
   // let consecutiveFailures = 0;
   // let circuitOpenUntil = 0;
   ```

2. Import circuit breaker repository and constants:
   ```typescript
   import * as CircuitBreakerRepo from '../repositories/circuitBreaker.repository.js';
   import { CIRCUIT_FAILURE_THRESHOLD, CIRCUIT_COOLDOWN_MS } from '../constants/ml.constants.js';
   ```

3. Refactor `isCircuitOpen` to be async:
   ```typescript
   async function isCircuitOpen(): Promise<boolean> {
     const state = await CircuitBreakerRepo.getCircuitState();

     if (state.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
       if (Date.now() < state.circuitOpenUntil) {
         return true;
       }
       // Half-open: allow one probe request (don't update state here)
     }
     return false;
   }
   ```

4. Refactor `recordSuccess`:
   ```typescript
   async function recordSuccess(): Promise<void> {
     await CircuitBreakerRepo.recordSuccess();
   }
   ```

5. Refactor `recordFailure`:
   ```typescript
   async function recordFailure(): Promise<void> {
     const state = await CircuitBreakerRepo.getCircuitState();
     await CircuitBreakerRepo.recordFailure(
       state.consecutiveFailures,
       CIRCUIT_FAILURE_THRESHOLD,
       CIRCUIT_COOLDOWN_MS,
     );
   }
   ```

6. Update `getMlSentiment` to await circuit checks:
   ```typescript
   export async function getMlSentiment(text: string): Promise<number | null> {
     // ... validation ...

     // Circuit breaker: fail-fast if service is down
     if (await isCircuitOpen()) {
       console.warn('[MlSentimentService] Circuit open, skipping ML analysis');
       return null;
     }

     // ... rest of implementation ...

     // On success:
     await recordSuccess();

     // On failure:
     await recordFailure();
   }
   ```

**Verification Checklist:**
- [ ] Module-level state removed
- [ ] All circuit operations use repository
- [ ] Constants imported from ml.constants.ts
- [ ] Async/await used correctly throughout
- [ ] Error handling preserved
- [ ] TypeScript compilation succeeds
- [ ] Unit tests created in Task 10 (repository tests don't exist yet)

**Testing Instructions:**
```bash
cd backend
npm run type-check
npm test -- --testPathPattern=mlSentiment
```

**Commit Message Template:**
```
refactor(backend): persist circuit breaker state to DynamoDB

- Remove module-level consecutiveFailures/circuitOpenUntil
- Use CircuitBreakerRepo for state persistence
- State now survives Lambda cold starts
- Import constants from ml.constants.ts
```

---

## Task 9: Update SAM Template

**Goal:** Replace 7 table definitions with 1 unified table in template.yaml.

**Files to Modify:**
- `backend/template.yaml`

**Implementation Steps:**

1. Remove the 7 individual table definitions:
   - StocksCacheTable
   - NewsCacheTable
   - SentimentCacheTable
   - SentimentJobsTable
   - StockHistoricalData
   - ArticleAnalysisData
   - DailySentimentAggregate

2. Add single unified table:
   ```yaml
   # Unified DynamoDB Table (Single-Table Design)
   # See docs/plans/Phase-0.md ADR-003 for design rationale
   ReactStocksTable:
     Type: AWS::DynamoDB::Table
     Properties:
       TableName: !Sub '${AWS::StackName}-Table'
       BillingMode: PAY_PER_REQUEST
       AttributeDefinitions:
         - AttributeName: pk
           AttributeType: S
         - AttributeName: sk
           AttributeType: S
       KeySchema:
         - AttributeName: pk
           KeyType: HASH
         - AttributeName: sk
           KeyType: RANGE
       TimeToLiveSpecification:
         Enabled: true
         AttributeName: ttl
       Tags:
         - Key: Project
           Value: react-stocks
         - Key: Design
           Value: single-table
   ```

3. Update Lambda environment variables:
   ```yaml
   # Replace individual table vars with single table
   Environment:
     Variables:
       DYNAMODB_TABLE_NAME: !Ref ReactStocksTable
       # Remove: STOCKS_CACHE_TABLE, NEWS_CACHE_TABLE, etc.
   ```

4. Update IAM policies:
   ```yaml
   Policies:
     - Statement:
         - Effect: Allow
           Action:
             - dynamodb:GetItem
             - dynamodb:PutItem
             - dynamodb:UpdateItem
             - dynamodb:DeleteItem
             - dynamodb:Query
             - dynamodb:BatchGetItem
             - dynamodb:BatchWriteItem
           Resource:
             - !GetAtt ReactStocksTable.Arn
   ```

5. Update Python Lambda similarly (if it accesses DynamoDB directly)

6. Update Outputs section

**Verification Checklist:**
- [ ] Single table defined with pk/sk keys
- [ ] TTL enabled on unified table
- [ ] Lambda environment updated
- [ ] IAM policies point to new table ARN
- [ ] `sam validate` passes
- [ ] Old table definitions removed

**Testing Instructions:**
```bash
cd backend
sam validate
sam build
```

**Commit Message Template:**
```
refactor(infra): consolidate 7 DynamoDB tables into single-table

- Remove StocksCache, NewsCache, SentimentCache, SentimentJobs tables
- Remove StockHistoricalData, ArticleAnalysisData, DailySentimentAggregate
- Add unified ReactStocksTable with pk/sk composite key
- Update Lambda environment variables
- Simplify IAM policies to single table ARN
```

---

## Task 10: Create Repository Unit Tests

**Goal:** Create unit tests for all repositories. Note: The `backend/src/repositories/__tests__/` directory does not exist - it must be created.

**Files to Create:**
- `backend/src/repositories/__tests__/circuitBreaker.repository.test.ts`
- `backend/src/repositories/__tests__/newsCache.repository.test.ts`
- `backend/src/repositories/__tests__/sentimentCache.repository.test.ts`
- `backend/src/repositories/__tests__/sentimentJobs.repository.test.ts`
- `backend/src/repositories/__tests__/dailySentimentAggregate.repository.test.ts`

**Prerequisites:**
- Create directory: `mkdir -p backend/src/repositories/__tests__`

**Implementation Steps:**

1. Create circuit breaker tests:
   ```typescript
   import { jest } from '@jest/globals';
   import * as CircuitBreakerRepo from '../circuitBreaker.repository';

   // Mock dynamodb.util
   jest.mock('../../utils/dynamodb.util', () => ({
     getItem: jest.fn(),
     putItem: jest.fn(),
   }));

   describe('CircuitBreakerRepository', () => {
     beforeEach(() => {
       jest.clearAllMocks();
     });

     describe('getCircuitState', () => {
       it('returns default state when no record exists', async () => {
         // Mock getItem to return null
         const state = await CircuitBreakerRepo.getCircuitState();
         expect(state.consecutiveFailures).toBe(0);
         expect(state.circuitOpenUntil).toBe(0);
       });

       it('returns stored state when record exists', async () => {
         // Mock getItem to return stored state
       });
     });

     describe('recordSuccess', () => {
       it('resets consecutive failures to 0', async () => {
         await CircuitBreakerRepo.recordSuccess();
         // Verify putItem called with correct state
       });
     });

     describe('recordFailure', () => {
       it('increments failure count', async () => {
         const result = await CircuitBreakerRepo.recordFailure(2, 5, 30000);
         expect(result.isOpen).toBe(false);
       });

       it('opens circuit when threshold reached', async () => {
         const result = await CircuitBreakerRepo.recordFailure(4, 5, 30000);
         expect(result.isOpen).toBe(true);
         expect(result.openUntil).toBeGreaterThan(Date.now());
       });
     });
   });
   ```

2. Create tests for other repositories following the same pattern:
   - Mock the new `dynamodb.util` module
   - Test with new composite key formats
   - Verify TTL handling
   - Cover CRUD operations and edge cases

**Verification Checklist:**
- [ ] `__tests__` directory created
- [ ] Circuit breaker repository fully tested
- [ ] All repository tests created and passing
- [ ] Mocking strategy consistent across tests
- [ ] Edge cases covered (empty results, errors)

**Testing Instructions:**
```bash
cd backend
npm test
```

**Commit Message Template:**
```
test(backend): create repository unit tests

- Create backend/src/repositories/__tests__/ directory
- Add circuitBreaker.repository.test.ts
- Add tests for newsCache, sentimentCache, sentimentJobs, dailySentimentAggregate
- Mock dynamodb.util consistently
```

---

## Task 11: Update Repository Index

**Goal:** Update the repository barrel export to include all repositories.

**Files to Modify:**
- `backend/src/repositories/index.ts`

**Implementation Steps:**

1. Update exports:
   ```typescript
   export * as NewsCache from './newsCache.repository.js';
   export * as SentimentCache from './sentimentCache.repository.js';
   export * as SentimentJobs from './sentimentJobs.repository.js';
   export * as DailySentimentAggregate from './dailySentimentAggregate.repository.js';
   export * as CircuitBreaker from './circuitBreaker.repository.js';
   ```

**Verification Checklist:**
- [ ] All repositories exported
- [ ] CircuitBreaker added to exports
- [ ] TypeScript compilation succeeds

**Testing Instructions:**
```bash
cd backend
npm run type-check
```

**Commit Message Template:**
```
chore(backend): update repository index exports

- Add CircuitBreaker to exports
- Ensure all repositories exported
```

---

## Task 12: Integration Testing

**Goal:** Verify the full system works with the new single-table design.

**Files to Modify:**
- None (testing only)

**Implementation Steps:**

1. Run full test suite:
   ```bash
   npm run check
   ```

2. Run code hygiene:
   ```bash
   npm run hygiene
   ```

3. Test local SAM invocation (if available):
   ```bash
   cd backend
   sam build
   sam local invoke ReactStocksFunction -e events/test-event.json
   ```

4. Verify no breaking changes in API behavior

**Verification Checklist:**
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] `npm run check` passes
- [ ] `npm run hygiene` clean
- [ ] SAM build succeeds

**Testing Instructions:**
```bash
npm run check
npm run hygiene
cd backend && sam build
```

**Commit Message Template:**
N/A (no code changes)

---

## Phase Verification

After completing all tasks:

1. **Full Test Suite:**
   ```bash
   npm run check
   ```

2. **SAM Validation:**
   ```bash
   cd backend
   sam validate
   sam build
   ```

3. **Code Review Checklist:**
   - [ ] All 7 old table references removed
   - [ ] Single table with pk/sk keys
   - [ ] TTL per entity type preserved
   - [ ] Circuit breaker persists to DynamoDB
   - [ ] All tests pass
   - [ ] No hardcoded table names (all from env)

4. **Deployment Considerations:**
   - The old tables will remain until items TTL expire
   - New deployments will create the unified table
   - No data migration needed (old data TTLs naturally)
   - First deploy after this change creates new table structure

**Known Limitations:**
- Existing data in old tables is not migrated (acceptable - TTL will clean up)
- Python Lambda needs similar updates if it accesses DynamoDB directly

**Technical Debt Created:**
- Old tables remain in deployed stacks until manual cleanup or TTL expiration
- May want to add a cleanup script to delete old empty tables
