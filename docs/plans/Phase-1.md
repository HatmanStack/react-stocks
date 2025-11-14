# Phase 1: DynamoDB Foundation

## Phase Goal

Establish DynamoDB infrastructure as the shared cache layer, including table definitions, IAM permissions, and base repository abstractions. By the end of this phase, Lambda functions will have the ability to read/write to DynamoDB tables, with comprehensive unit tests validating CRUD operations.

**Success Criteria:**
- ✅ 4 DynamoDB tables deployed via SAM template
- ✅ IAM role grants Lambda read/write permissions to all tables
- ✅ Repository pattern abstracts DynamoDB operations
- ✅ Shared utilities for TTL, batch operations, and retries
- ✅ Unit tests validate all repository methods
- ✅ SAM deploy succeeds without errors

**Estimated tokens:** ~35,000

---

## Prerequisites

- **Phase 0 complete**: Reviewed architecture decisions and design patterns
- **AWS SAM CLI**: Version ≥1.100.0 installed (`sam --version`)
- **AWS credentials**: Configured with permissions to create DynamoDB tables and IAM roles
- **Backend deployed**: Existing Lambda function deployed and functional
- **Git clean**: Working directory committed or changes stashed

---

## Tasks

### Task 1.1: Define DynamoDB Tables in SAM Template

**Goal:** Add 4 DynamoDB table definitions to `backend/template.yaml` with proper schemas, indexes, and TTL configuration.

**Files to Modify:**
- `backend/template.yaml` - Add Resources section for DynamoDB tables

**Prerequisites:**
- Review Phase-0.md ADR-3 for table schemas
- Understand DynamoDB on-demand vs provisioned capacity (use on-demand for cost efficiency)

**Implementation Steps:**

1. **Add StocksCache table** to the Resources section:
   - Partition key: `ticker` (String)
   - Sort key: `date` (String)
   - Enable TTL on `ttl` attribute
   - Use on-demand billing mode
   - Add tags for cost tracking (e.g., `Project: react-stocks`, `CacheType: stocks`)

2. **Add NewsCache table**:
   - Partition key: `ticker` (String)
   - Sort key: `articleHash` (String)
   - Enable TTL on `ttl` attribute
   - Use on-demand billing mode

3. **Add SentimentCache table**:
   - Partition key: `ticker` (String)
   - Sort key: `articleHash` (String)
   - Enable TTL on `ttl` attribute
   - Use on-demand billing mode

4. **Add SentimentJobs table**:
   - Partition key: `jobId` (String)
   - No sort key (simple key-value store)
   - Enable TTL on `ttl` attribute
   - Use on-demand billing mode

5. **Add table ARN outputs** to Outputs section for reference:
   - `StocksCacheTableArn`
   - `NewsCacheTableArn`
   - `SentimentCacheTableArn`
   - `SentimentJobsTableArn`

**Verification Checklist:**
- [ ] All 4 tables defined with correct key schemas
- [ ] TTL enabled on each table pointing to `ttl` attribute
- [ ] BillingMode set to PAY_PER_REQUEST (on-demand)
- [ ] Table names use `!Sub` for stack-based naming (e.g., `${AWS::StackName}-StocksCache`)
- [ ] Outputs export table ARNs for cross-stack reference
- [ ] YAML syntax is valid (`sam validate --lint`)

**Testing Instructions:**
- Run `sam validate --template backend/template.yaml` to check syntax
- Run `sam build` in `backend/` directory to ensure template compiles
- Do NOT deploy yet (will deploy after IAM roles added)

**Commit Message Template:**
```
feat(dynamodb): add DynamoDB table definitions to SAM template

- Define StocksCache table with ticker+date composite key
- Define NewsCache table with ticker+articleHash composite key
- Define SentimentCache table with ticker+articleHash composite key
- Define SentimentJobs table with jobId primary key
- Enable TTL on all tables for auto-expiration
- Use on-demand billing for cost efficiency
- Export table ARNs in CloudFormation outputs

Task: Phase 1, Task 1.1
```

**Estimated tokens:** ~3,000

---

### Task 1.2: Grant Lambda IAM Permissions for DynamoDB

**Goal:** Update the Lambda function's IAM role to grant read/write permissions to all 4 DynamoDB tables.

**Files to Modify:**
- `backend/template.yaml` - Add Policies to ReactStocksFunction

**Prerequisites:**
- Task 1.1 complete (tables defined)
- Understand AWS IAM policy syntax (Statement, Effect, Action, Resource)

**Implementation Steps:**

1. **Add DynamoDB policy statement** to Lambda function's `Policies` section:
   - Grant `dynamodb:GetItem`, `dynamodb:PutItem`, `dynamodb:UpdateItem`, `dynamodb:DeleteItem`, `dynamodb:Query`, `dynamodb:BatchGetItem`, `dynamodb:BatchWriteItem`
   - Apply to all 4 table ARNs using `!GetAtt`
   - Use principle of least privilege (only grant necessary actions)

2. **Add environment variables** to Lambda function:
   - `STOCKS_CACHE_TABLE`: Reference to StocksCache table name
   - `NEWS_CACHE_TABLE`: Reference to NewsCache table name
   - `SENTIMENT_CACHE_TABLE`: Reference to SentimentCache table name
   - `SENTIMENT_JOBS_TABLE`: Reference to SentimentJobs table name

3. **Verify CloudFormation references** use `!Ref` for table names and `!GetAtt` for ARNs

**Verification Checklist:**
- [ ] IAM policy grants all required DynamoDB actions
- [ ] Policy Resource list includes all 4 table ARNs
- [ ] Environment variables correctly reference table names
- [ ] No wildcard permissions (e.g., `dynamodb:*` on `*` resources)
- [ ] Template validates without errors (`sam validate`)

**Testing Instructions:**
- Run `sam validate --template backend/template.yaml`
- Run `sam build` to ensure no syntax errors
- Visually inspect generated IAM policy in `.aws-sam/build/template.yaml`

**Commit Message Template:**
```
feat(lambda): grant DynamoDB read/write permissions to Lambda function

- Add IAM policy statement for DynamoDB operations
- Grant GetItem, PutItem, UpdateItem, DeleteItem, Query, BatchGetItem, BatchWriteItem
- Apply policy to all 4 cache tables (StocksCache, NewsCache, SentimentCache, SentimentJobs)
- Add environment variables for table name references
- Follow least privilege principle (no wildcard permissions)

Task: Phase 1, Task 1.2
```

**Estimated tokens:** ~2,000

---

### Task 1.3: Deploy DynamoDB Infrastructure

**Goal:** Deploy the updated SAM template to create DynamoDB tables and update Lambda IAM role.

**Files to Modify:**
- None (deployment only)

**Prerequisites:**
- Task 1.2 complete (IAM policies added)
- AWS credentials configured with deployment permissions
- Terminal access to `backend/` directory

**Implementation Steps:**

1. **Build the SAM application**:
   - Navigate to `backend/` directory
   - Run `sam build` to compile TypeScript and template
   - Verify build succeeds without errors

2. **Deploy using guided mode** (first time with new parameters):
   - Run `sam deploy --guided`
   - Confirm stack name (use existing stack name to update)
   - Confirm region
   - Confirm capabilities `CAPABILITY_IAM` (required for IAM role changes)
   - Review changeset (should show 4 new tables, 1 IAM role update)
   - Confirm deployment

3. **Verify deployment** in AWS Console:
   - Open DynamoDB console → Tables
   - Confirm all 4 tables exist with correct schemas
   - Check TTL is enabled on each table (may take a few minutes to activate)
   - Open Lambda console → Functions → Permissions
   - Confirm IAM role has DynamoDB policy attached

4. **Save deployment outputs**:
   - Note table ARNs from CloudFormation Outputs
   - Verify environment variables set in Lambda configuration

**Verification Checklist:**
- [ ] `sam build` completes successfully
- [ ] `sam deploy` completes without errors
- [ ] All 4 DynamoDB tables visible in AWS Console
- [ ] TTL enabled on each table (check "Time to Live" tab)
- [ ] Lambda function has environment variables set (STOCKS_CACHE_TABLE, etc.)
- [ ] Lambda execution role has DynamoDB permissions (check IAM policy)
- [ ] No breaking changes to existing Lambda functionality (test `/stocks` endpoint)

**Testing Instructions:**
- Run `sam build && sam deploy --guided`
- After deployment, test existing `/stocks` endpoint: `curl https://your-api-url.execute-api.us-east-1.amazonaws.com/stocks?ticker=AAPL&startDate=2025-01-01&type=prices`
- Verify response is unchanged (tables exist but not used yet)
- Check CloudWatch Logs for Lambda execution (should show environment variables set)

**Commit Message Template:**
```
chore(deploy): deploy DynamoDB tables and updated IAM permissions

- Successfully deployed 4 DynamoDB tables via SAM
- Tables: StocksCache, NewsCache, SentimentCache, SentimentJobs
- TTL enabled on all tables for auto-expiration
- Lambda IAM role updated with DynamoDB permissions
- Environment variables configured for table name references

Task: Phase 1, Task 1.3
```

**Estimated tokens:** ~2,500

---

### Task 1.4: Create Shared DynamoDB Utilities

**Goal:** Build reusable utility functions for DynamoDB operations (TTL calculation, batch operations, retries) to be used across all repositories.

**Files to Create:**
- `backend/src/utils/dynamodb.util.ts` - DynamoDB-specific utilities
- `backend/src/utils/cache.util.ts` - Cache helper functions
- `backend/src/utils/job.util.ts` - Job ID generation and parsing

**Prerequisites:**
- Task 1.3 complete (tables deployed)
- Understand DynamoDB SDK v3 command pattern (`send(new GetItemCommand(...))`)

**Implementation Steps:**

1. **Create `dynamodb.util.ts`** with functions:
   - `buildUpdateExpression(updates: Record<string, any>): { UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues }` - Generate DynamoDB update syntax
   - `batchGetItems<T>(tableName: string, keys: any[]): Promise<T[]>` - Handle batch reads with pagination (DynamoDB limit: 100 items)
   - `batchPutItems(tableName: string, items: any[]): Promise<void>` - Handle batch writes (DynamoDB limit: 25 items per request)
   - `withRetry<T>(fn: () => Promise<T>, maxRetries: number = 3): Promise<T>` - Exponential backoff retry for throttling

2. **Create `cache.util.ts`** with functions:
   - `calculateTTL(daysFromNow: number): number` - Return Unix timestamp for DynamoDB TTL (e.g., `Date.now() / 1000 + daysFromNow * 86400`)
   - `isCacheFresh(fetchedAt: number, maxAgeMs: number): boolean` - Check if cached item is still fresh
   - `generateCacheKey(ticker: string, date: string): string` - Consistent key generation (e.g., `${ticker}#${date}`)

3. **Create `job.util.ts`** with functions:
   - `generateJobId(ticker: string, startDate: string, endDate: string): string` - Deterministic job ID (e.g., `${ticker}_${startDate}_${endDate}`)
   - `parseJobId(jobId: string): { ticker: string, startDate: string, endDate: string }` - Extract components from job ID

4. **Add TypeScript types** for common structures:
   - `CacheItem` interface with `ttl`, `fetchedAt` properties
   - `JobStatus` type: `'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'`

5. **Export all utilities** from a barrel file `backend/src/utils/index.ts` for easy imports

**Verification Checklist:**
- [ ] All utility functions have JSDoc comments with examples
- [ ] Functions are pure (no side effects beyond DynamoDB calls)
- [ ] TypeScript types are properly defined and exported
- [ ] Batch functions handle pagination correctly (test with >25 items)
- [ ] Retry function implements exponential backoff (test timing)
- [ ] TTL calculation returns Unix timestamp (seconds, not milliseconds)

**Testing Instructions:**

Create unit tests in `backend/src/utils/__tests__/`:

- **`dynamodb.util.test.ts`**:
  - Test `buildUpdateExpression` with various update objects
  - Test `batchPutItems` splits large arrays into chunks of 25
  - Test `withRetry` retries on failure and succeeds on retry

- **`cache.util.test.ts`**:
  - Test `calculateTTL` returns correct Unix timestamp
  - Test `isCacheFresh` correctly identifies stale items
  - Test `generateCacheKey` returns consistent format

- **`job.util.test.ts`**:
  - Test `generateJobId` creates deterministic IDs
  - Test `parseJobId` correctly extracts ticker and dates

Run tests: `cd backend && npm test -- utils`

**Commit Message Template:**
```
feat(utils): create shared DynamoDB and cache utility functions

- Add dynamodb.util.ts with batch operations and retry logic
- Add cache.util.ts for TTL calculation and freshness checks
- Add job.util.ts for job ID generation and parsing
- Implement exponential backoff retry for throttling errors
- Add comprehensive unit tests for all utilities
- Export utilities from barrel file for easy imports

Task: Phase 1, Task 1.4
```

**Estimated tokens:** ~4,000

---

### Task 1.5: Create StocksCache Repository

**Goal:** Implement repository pattern for StocksCache table, providing CRUD operations for stock price data.

**Files to Create:**
- `backend/src/repositories/stocksCache.repository.ts` - StocksCache operations
- `backend/src/repositories/__tests__/stocksCache.repository.test.ts` - Unit tests

**Prerequisites:**
- Task 1.4 complete (utilities available)
- Review Phase-0.md ADR-3 for StocksCache schema

**Implementation Steps:**

1. **Define TypeScript interfaces** for stock cache data:
   - `StockCacheItem` with properties: `ticker`, `date`, `priceData`, `metadata`, `ttl`, `fetchedAt`
   - `PriceData` with OHLCV properties matching SQLite schema

2. **Create repository with methods**:
   - `getStock(ticker: string, date: string): Promise<StockCacheItem | null>` - Get single stock price
   - `putStock(item: StockCacheItem): Promise<void>` - Cache stock data with auto-calculated TTL (7 days)
   - `batchGetStocks(ticker: string, dates: string[]): Promise<StockCacheItem[]>` - Get multiple dates
   - `batchPutStocks(items: StockCacheItem[]): Promise<void>` - Batch cache multiple records
   - `queryStocksByDateRange(ticker: string, startDate: string, endDate: string): Promise<StockCacheItem[]>` - Query using DynamoDB Query API

3. **Initialize DynamoDB client** outside functions for Lambda reuse:
   - Use `DynamoDBClient` from `@aws-sdk/client-dynamodb`
   - Use `DynamoDBDocumentClient` for automatic marshalling
   - Get table name from `process.env.STOCKS_CACHE_TABLE`

4. **Add TTL auto-calculation**:
   - Use `calculateTTL(7)` from cache.util.ts when putting items
   - Always set `fetchedAt` to current timestamp

5. **Add error handling**:
   - Handle `ConditionalCheckFailedException` (item already exists)
   - Handle `ProvisionedThroughputExceededException` with retry
   - Log errors with context (ticker, date, operation)

**Verification Checklist:**
- [ ] All methods have JSDoc comments with examples
- [ ] DynamoDB client initialized outside handler functions
- [ ] TTL automatically set to 7 days from now
- [ ] Batch operations use `batchGetItems` and `batchPutItems` utilities
- [ ] Error handling for DynamoDB-specific errors
- [ ] TypeScript types match DynamoDB schema

**Testing Instructions:**

Create comprehensive unit tests:

- **Test `putStock` and `getStock`**:
  - Put stock data, retrieve it, verify match
  - Verify TTL is set correctly (~7 days from now)
  - Test cache miss returns null

- **Test `batchPutStocks` and `batchGetStocks`**:
  - Put 30 stocks (more than batch limit), verify all saved
  - Batch get 30 stocks, verify all retrieved

- **Test `queryStocksByDateRange`**:
  - Put stocks for ticker AAPL on 5 different dates
  - Query date range covering 3 dates, verify only 3 returned
  - Query with no results, verify empty array

Run tests: `cd backend && npm test -- repositories/stocksCache.repository`

**Note:** Tests may require DynamoDB Local or mocking. If using mocks, create `backend/src/repositories/__mocks__/dynamodb.mock.ts` with in-memory storage.

**Commit Message Template:**
```
feat(repository): create StocksCache repository for DynamoDB operations

- Implement CRUD operations for stock price caching
- Add batch get/put methods for efficient multi-date queries
- Auto-calculate TTL (7 days) on put operations
- Add date range queries using DynamoDB Query API
- Implement error handling for DynamoDB-specific exceptions
- Add comprehensive unit tests with 95%+ coverage

Task: Phase 1, Task 1.5
```

**Estimated tokens:** ~5,000

---

### Task 1.6: Create NewsCache Repository

**Goal:** Implement repository for NewsCache table to cache news articles by ticker and article hash.

**Files to Create:**
- `backend/src/repositories/newsCache.repository.ts` - NewsCache operations
- `backend/src/repositories/__tests__/newsCache.repository.test.ts` - Unit tests

**Prerequisites:**
- Task 1.5 complete (reference StocksCache repository pattern)
- Review Phase-0.md ADR-3 for NewsCache schema

**Implementation Steps:**

1. **Define TypeScript interfaces**:
   - `NewsCacheItem` with properties: `ticker`, `articleHash`, `article`, `ttl`, `fetchedAt`
   - `NewsArticle` with properties: `title`, `url`, `description`, `date`, `publisher`

2. **Create repository with methods**:
   - `getArticle(ticker: string, articleHash: string): Promise<NewsCacheItem | null>`
   - `putArticle(item: NewsCacheItem): Promise<void>` - Auto-calculate TTL (30 days)
   - `batchPutArticles(items: NewsCacheItem[]): Promise<void>`
   - `queryArticlesByTicker(ticker: string): Promise<NewsCacheItem[]>` - Get all articles for ticker
   - `existsInCache(ticker: string, articleHash: string): Promise<boolean>` - Check if article cached

3. **Follow same patterns as StocksCache**:
   - Initialize DynamoDB client outside functions
   - Use `calculateTTL(30)` for 30-day expiration
   - Use batch utilities from dynamodb.util.ts
   - Handle DynamoDB-specific errors

4. **Add deduplication logic**:
   - `existsInCache` method prevents duplicate article insertion
   - Use conditional expression in `putArticle`: `attribute_not_exists(articleHash)`

**Verification Checklist:**
- [ ] TTL set to 30 days (not 7 like stocks)
- [ ] `existsInCache` method implemented for duplicate detection
- [ ] Batch operations handle >25 articles correctly
- [ ] All methods follow StocksCache repository pattern
- [ ] Conditional expressions prevent duplicate articles

**Testing Instructions:**

Create unit tests similar to StocksCache:

- **Test CRUD operations**:
  - Put article, get article, verify match
  - Verify TTL ~30 days from now
  - Test cache miss returns null

- **Test `existsInCache`**:
  - Put article, verify exists returns true
  - Check non-existent article, verify returns false

- **Test batch operations**:
  - Put 50 articles, verify all cached
  - Query all articles for ticker, verify count matches

Run tests: `cd backend && npm test -- repositories/newsCache.repository`

**Commit Message Template:**
```
feat(repository): create NewsCache repository for article caching

- Implement CRUD operations for news article caching
- Add existsInCache method for duplicate detection
- Auto-calculate TTL (30 days) for article expiration
- Add batch put operations for efficient bulk caching
- Add query by ticker to retrieve all cached articles
- Comprehensive unit tests with edge case coverage

Task: Phase 1, Task 1.6
```

**Estimated tokens:** ~4,500

---

### Task 1.7: Create SentimentCache Repository

**Goal:** Implement repository for SentimentCache table to cache sentiment analysis results.

**Files to Create:**
- `backend/src/repositories/sentimentCache.repository.ts` - SentimentCache operations
- `backend/src/repositories/__tests__/sentimentCache.repository.test.ts` - Unit tests

**Prerequisites:**
- Task 1.6 complete
- Review Phase-0.md ADR-3 for SentimentCache schema

**Implementation Steps:**

1. **Define TypeScript interfaces**:
   - `SentimentCacheItem` with properties: `ticker`, `articleHash`, `sentiment`, `analyzedAt`, `ttl`
   - `SentimentData` with properties: `positive`, `negative`, `sentimentScore`, `classification` (POS/NEG/NEUT)

2. **Create repository with methods**:
   - `getSentiment(ticker: string, articleHash: string): Promise<SentimentCacheItem | null>`
   - `putSentiment(item: SentimentCacheItem): Promise<void>` - Auto-calculate TTL (90 days)
   - `batchPutSentiments(items: SentimentCacheItem[]): Promise<void>`
   - `querySentimentsByTicker(ticker: string): Promise<SentimentCacheItem[]>`
   - `existsInCache(ticker: string, articleHash: string): Promise<boolean>`

3. **Key differences from NewsCache**:
   - TTL is 90 days (sentiment is timeless)
   - `analyzedAt` timestamp instead of `fetchedAt`
   - Sentiment data structure differs from article structure

4. **Follow established patterns**:
   - Same error handling as previous repositories
   - Use batch utilities for >25 items
   - Conditional expressions to prevent duplicates

**Verification Checklist:**
- [ ] TTL set to 90 days (longest expiration)
- [ ] `analyzedAt` timestamp set on put operations
- [ ] Sentiment data structure matches frontend expectations
- [ ] All methods follow repository pattern
- [ ] Comprehensive error handling

**Testing Instructions:**

Create unit tests:

- **Test CRUD operations**:
  - Put sentiment, get sentiment, verify match
  - Verify TTL ~90 days from now
  - Test cache miss returns null

- **Test batch operations**:
  - Put 100 sentiments, verify all cached
  - Query by ticker, verify results

- **Test `existsInCache`**:
  - Verify returns true for cached sentiment
  - Verify returns false for uncached

Run tests: `cd backend && npm test -- repositories/sentimentCache.repository`

**Commit Message Template:**
```
feat(repository): create SentimentCache repository for sentiment results

- Implement CRUD operations for sentiment caching
- Auto-calculate TTL (90 days) for long-term caching
- Add batch put for efficient multi-article sentiment storage
- Add existsInCache for duplicate detection
- Query by ticker to retrieve all cached sentiments
- Comprehensive unit tests with full coverage

Task: Phase 1, Task 1.7
```

**Estimated tokens:** ~4,000

---

### Task 1.8: Create SentimentJobs Repository

**Goal:** Implement repository for SentimentJobs table to track async sentiment processing jobs.

**Files to Create:**
- `backend/src/repositories/sentimentJobs.repository.ts` - Job tracking operations
- `backend/src/repositories/__tests__/sentimentJobs.repository.test.ts` - Unit tests

**Prerequisites:**
- Task 1.7 complete
- Review Phase-0.md ADR-2 for job status workflow

**Implementation Steps:**

1. **Define TypeScript interfaces**:
   - `SentimentJob` with properties: `jobId`, `status`, `ticker`, `startDate`, `endDate`, `startedAt`, `completedAt`, `articlesProcessed`, `error`, `ttl`
   - `JobStatus` type: `'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'`

2. **Create repository with methods**:
   - `getJob(jobId: string): Promise<SentimentJob | null>`
   - `createJob(job: Omit<SentimentJob, 'ttl'>): Promise<void>` - Auto-calculate TTL (24 hours)
   - `updateJobStatus(jobId: string, status: JobStatus, updates?: Partial<SentimentJob>): Promise<void>` - Use `buildUpdateExpression` utility
   - `markJobCompleted(jobId: string, articlesProcessed: number): Promise<void>` - Helper method
   - `markJobFailed(jobId: string, error: string): Promise<void>` - Helper method

3. **Job lifecycle management**:
   - `createJob` sets status to `PENDING`, generates TTL for 24 hours
   - `updateJobStatus` uses DynamoDB UpdateItem for atomic updates
   - Helper methods (`markJobCompleted`, `markJobFailed`) wrap `updateJobStatus`

4. **Add idempotency**:
   - Check if job exists before creating
   - Return existing job if already COMPLETED (prevent duplicate processing)

**Verification Checklist:**
- [ ] TTL set to 24 hours (jobs are short-lived)
- [ ] `updateJobStatus` uses atomic UpdateItem (not GetItem + PutItem)
- [ ] Helper methods provide clean API for common status transitions
- [ ] Idempotency handled for duplicate job creation
- [ ] Job lifecycle follows PENDING → IN_PROGRESS → COMPLETED/FAILED

**Testing Instructions:**

Create unit tests:

- **Test job creation**:
  - Create job, verify status is PENDING
  - Verify TTL is ~24 hours from now
  - Create duplicate job, verify idempotent behavior

- **Test status updates**:
  - Create job, update to IN_PROGRESS, verify status changed
  - Mark completed, verify completedAt timestamp set
  - Mark failed, verify error message stored

- **Test helpers**:
  - `markJobCompleted` sets status to COMPLETED and articlesProcessed
  - `markJobFailed` sets status to FAILED and error message

Run tests: `cd backend && npm test -- repositories/sentimentJobs.repository`

**Commit Message Template:**
```
feat(repository): create SentimentJobs repository for async job tracking

- Implement job lifecycle management (PENDING → IN_PROGRESS → COMPLETED/FAILED)
- Add atomic status updates using DynamoDB UpdateItem
- Create helper methods for common transitions (markJobCompleted, markJobFailed)
- Auto-calculate TTL (24 hours) for job cleanup
- Implement idempotency for duplicate job creation
- Comprehensive unit tests covering all job states

Task: Phase 1, Task 1.8
```

**Estimated tokens:** ~4,500

---

### Task 1.9: Create Repository Barrel Export

**Goal:** Create a single entry point for importing all repositories, simplifying imports in Lambda handlers.

**Files to Create:**
- `backend/src/repositories/index.ts` - Barrel export file

**Prerequisites:**
- Tasks 1.5-1.8 complete (all repositories created)

**Implementation Steps:**

1. **Create `index.ts`** that exports all repositories:
   ```typescript
   export * from './stocksCache.repository';
   export * from './newsCache.repository';
   export * from './sentimentCache.repository';
   export * from './sentimentJobs.repository';
   ```

2. **Verify imports work** from other files:
   - Test import: `import { StocksCacheRepository } from '@/repositories';`
   - Ensure TypeScript path alias `@/*` maps to `src/*` in `tsconfig.json`

**Verification Checklist:**
- [ ] All repositories exported from barrel file
- [ ] Imports work from other files using barrel export
- [ ] No circular dependencies introduced

**Testing Instructions:**
- Create test file that imports all repositories via barrel
- Run TypeScript compiler: `cd backend && npx tsc --noEmit`
- Verify no compilation errors

**Commit Message Template:**
```
feat(repository): create barrel export for all repositories

- Export all repository modules from single entry point
- Simplify imports in Lambda handlers
- Verify no circular dependencies

Task: Phase 1, Task 1.9
```

**Estimated tokens:** ~1,000

---

## Phase Verification

After completing all tasks, verify the entire phase:

**Infrastructure Validation:**
- [ ] Run `sam build` in `backend/` without errors
- [ ] Run `sam validate` without errors
- [ ] All 4 DynamoDB tables exist in AWS Console
- [ ] TTL enabled on all tables (check "Time to Live" tab)
- [ ] Lambda IAM role has DynamoDB policy attached

**Code Validation:**
- [ ] All repository tests pass: `cd backend && npm test -- repositories`
- [ ] All utility tests pass: `cd backend && npm test -- utils`
- [ ] TypeScript compiles without errors: `cd backend && npx tsc --noEmit`
- [ ] ESLint passes: `cd backend && npm run lint`

**Integration Test (Manual):**
1. Import a repository in Lambda handler
2. Deploy Lambda
3. Invoke Lambda and write to DynamoDB
4. Verify item appears in DynamoDB Console

**Known Limitations:**
- Tables are empty (no data yet) - will populate in Phase 2
- Lambda handlers don't use repositories yet - will integrate in Phase 2
- No frontend integration - will add in Phase 4

---

## Next Steps

✅ **Phase 1 Complete!** You now have:
- 4 DynamoDB tables deployed
- IAM permissions configured
- Repository pattern for all cache operations
- Shared utilities for common tasks
- Comprehensive unit tests

**Proceed to Phase 2:** Implement Lambda caching layer for stocks and news endpoints.

→ **[Phase 2: Lambda Caching Layer](./Phase-2.md)**
