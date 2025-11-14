# Phase 0: Foundation - Architecture & Design Decisions

## Overview

This phase establishes architectural decisions, design patterns, and technical standards that apply across all implementation phases. These decisions inform how DynamoDB tables are structured, how Lambda functions interact with the cache, and how the frontend handles async sentiment loading.

**This is a reference document** - you won't write code in this phase, but you'll refer back to these decisions throughout Phases 1-5.

---

## Architecture Decision Records (ADRs)

### ADR-1: DynamoDB as Shared Cache, SQLite as Local Source of Truth

**Decision:** Use DynamoDB as a shared cache layer while maintaining SQLite/localStorage as the local source of truth.

**Context:**
- Current architecture: SQLite (native) / localStorage (web) as only data store
- Problem: Each user computes identical sentiment analysis for same articles
- Need: Share expensive computations across users while preserving offline capabilities

**Rationale:**
- **Offline-first preserved**: Local DB remains functional without network
- **Shared cache**: DynamoDB prevents redundant API calls and sentiment computation
- **Platform compatibility**: Works across iOS, Android, Web without platform-specific code
- **Cost-effective**: DynamoDB on-demand pricing scales with actual usage

**Consequences:**
- **Positive**: 90%+ reduction in API calls for popular stocks, faster load times
- **Negative**: Increased complexity (two data sources), potential sync issues
- **Mitigation**: Clear cache invalidation strategy, local DB is authoritative for user data

**Implementation Pattern:**
```typescript
// Three-tier lookup pattern
async function getData(ticker: string): Promise<Data> {
  // Tier 1: Local DB (fastest, always check first)
  const localData = await LocalRepository.findByTicker(ticker);
  if (localData && isFresh(localData)) return localData;

  // Tier 2: DynamoDB cache (shared across users)
  const cachedData = await DynamoRepository.getFromCache(ticker);
  if (cachedData) {
    await LocalRepository.upsert(cachedData); // Hydrate local DB
    return cachedData;
  }

  // Tier 3: Compute/Fetch (expensive, cache result)
  const freshData = await fetchFromAPI(ticker);
  await DynamoRepository.putInCache(ticker, freshData); // Cache for other users
  await LocalRepository.upsert(freshData); // Store locally
  return freshData;
}
```

---

### ADR-2: Async Sentiment Processing with Job Tracking

**Decision:** Process sentiment analysis asynchronously in Lambda with job status tracking in DynamoDB.

**Context:**
- Current: Sequential sentiment processing blocks UI for 45+ seconds
- Need: Return prices/news immediately, process sentiment in background
- Constraint: Lambda max timeout is 15 minutes (not 30s as previously thought)

**Rationale:**
- **Non-blocking**: Frontend gets prices/news instantly, sentiment loads progressively
- **User experience**: Show spinner on sentiment tab, other tabs fully functional
- **Scalability**: Lambda auto-scales for multiple users processing sentiment concurrently
- **Idempotent**: Job tracking prevents duplicate sentiment computation for same ticker+date

**Job Status States:**
```
PENDING → IN_PROGRESS → COMPLETED
                      ↘ FAILED
```

**Implementation Pattern:**
```typescript
// Lambda: POST /sentiment endpoint
async function processSentiment(ticker: string, dateRange: string) {
  const jobId = generateJobId(ticker, dateRange);

  // Check if job already exists
  const existingJob = await JobRepository.getJob(jobId);
  if (existingJob?.status === 'COMPLETED') {
    return { jobId, status: 'COMPLETED', cached: true };
  }

  // Create/update job status
  await JobRepository.updateJob(jobId, { status: 'IN_PROGRESS', startedAt: Date.now() });

  try {
    // Fetch news articles (from cache or API)
    const articles = await getNewsArticles(ticker, dateRange);

    // Analyze sentiment for each article
    const sentimentResults = await analyzeSentimentBatch(articles);

    // Store in DynamoDB sentiment cache
    await SentimentRepository.batchPut(ticker, sentimentResults);

    // Mark job complete
    await JobRepository.updateJob(jobId, {
      status: 'COMPLETED',
      completedAt: Date.now(),
      articlesProcessed: articles.length
    });

    return { jobId, status: 'COMPLETED', cached: false };
  } catch (error) {
    await JobRepository.updateJob(jobId, { status: 'FAILED', error: error.message });
    throw error;
  }
}

// Frontend: Poll for job completion
async function pollSentimentJob(jobId: string, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    const job = await fetch(`/sentiment/job/${jobId}`);
    if (job.status === 'COMPLETED') {
      // Fetch sentiment from DynamoDB and hydrate local DB
      const sentiment = await fetchSentimentResults(jobId);
      await LocalRepository.upsert(sentiment);
      return sentiment;
    }
    if (job.status === 'FAILED') throw new Error(job.error);

    await sleep(2000); // Poll every 2 seconds
  }
  throw new Error('Job timeout after 120 seconds');
}
```

---

### ADR-3: DynamoDB Table Design - Single-Table vs Multi-Table

**Decision:** Use **three separate tables** (StocksCache, NewsCache, SentimentCache) instead of single-table design.

**Context:**
- DynamoDB best practice often recommends single-table design for access patterns
- Our use case: Simple key-value lookups by ticker + date
- Team familiarity: Multi-table is more intuitive for developers unfamiliar with single-table

**Rationale:**
- **Simplicity**: Each table has obvious purpose, easier to reason about
- **Access patterns**: We only query by ticker+date (no complex joins or GSIs needed)
- **Cost**: No difference in cost for our access patterns
- **Evolution**: Easier to add indexes or modify schema per table independently

**Table Schemas:**

**StocksCache Table:**
```
PK: ticker (String) - e.g., "AAPL"
SK: date (String) - e.g., "2025-01-15"
Attributes:
  - priceData (Map) - OHLCV data
  - metadata (Map) - Company info
  - ttl (Number) - Expire after 7 days
  - fetchedAt (Number) - Timestamp
```

**NewsCache Table:**
```
PK: ticker (String) - e.g., "AAPL"
SK: articleHash (String) - e.g., "hash_12345"
Attributes:
  - article (Map) - Title, URL, description, date
  - ttl (Number) - Expire after 30 days
  - fetchedAt (Number) - Timestamp
```

**SentimentCache Table:**
```
PK: ticker (String) - e.g., "AAPL"
SK: articleHash (String) - e.g., "hash_12345"
Attributes:
  - sentiment (Map) - Positive/negative counts, sentiment score
  - analyzedAt (Number) - Timestamp
  - ttl (Number) - Expire after 90 days (sentiment is timeless)
```

**SentimentJobs Table:**
```
PK: jobId (String) - e.g., "AAPL_2025-01-01_2025-01-30"
Attributes:
  - status (String) - PENDING | IN_PROGRESS | COMPLETED | FAILED
  - ticker (String)
  - startDate (String)
  - endDate (String)
  - startedAt (Number)
  - completedAt (Number)
  - articlesProcessed (Number)
  - error (String)
  - ttl (Number) - Expire after 24 hours
```

**Consequences:**
- **Positive**: Clear separation of concerns, easy to understand
- **Negative**: 4 tables instead of 1 (but no cost difference for our patterns)
- **Mitigation**: Use SAM template to define all tables in one place

---

### ADR-4: TTL Strategy for Cost Management

**Decision:** Use DynamoDB TTL to auto-delete stale cached data.

**Context:**
- DynamoDB charges for storage (first 25GB free, then $0.25/GB)
- Sentiment analysis results are timeless (won't change)
- Stock prices and news become less relevant over time

**Rationale:**
- **Cost control**: Auto-delete old data prevents unbounded storage growth
- **Accuracy**: Old stock prices rarely queried, can re-fetch if needed
- **DynamoDB native**: TTL is free and automatic (no Lambda needed)

**TTL Values:**
| Table | TTL Duration | Rationale |
|-------|--------------|-----------|
| StocksCache | 7 days | Historical prices rarely change, re-fetch is cheap |
| NewsCache | 30 days | News articles don't change, but useful for recent context |
| SentimentCache | 90 days | Sentiment is timeless, keep longer to maximize cache hits |
| SentimentJobs | 24 hours | Jobs only relevant during processing, cleanup quickly |

**Implementation:**
- Add `ttl` attribute (Unix timestamp) to all items
- Enable TTL on each table pointing to `ttl` attribute
- Calculate TTL on insert: `Date.now() / 1000 + (7 * 24 * 60 * 60)` for 7 days

---

### ADR-5: Lambda Sentiment Analysis - Node.js Port vs Python Microservice

**Decision:** Port sentiment analysis to Node.js and run in Lambda (not call Python microservice).

**Context:**
- Current: Browser-based JavaScript sentiment analyzer (rule-based, AFINN lexicon)
- Alternative 1: Call existing Python microservice from Lambda
- Alternative 2: Port JavaScript analyzer to run in Lambda

**Rationale:**
- **Performance**: Node.js analyzer is <100ms per article (already ported to browser)
- **Cost**: No external HTTP calls, no microservice cold starts
- **Simplicity**: Single Lambda function, no network dependencies
- **Existing code**: `src/ml/sentiment/analyzer.ts` already implements algorithm

**Implementation:**
- Copy `src/ml/sentiment/analyzer.ts` to `backend/src/ml/sentiment/`
- Adjust imports (remove React Native dependencies)
- Use in Lambda handler directly
- No external API calls needed

**Trade-offs:**
- **Accuracy**: Rule-based (not FinBERT neural net), but current app already uses this
- **Consistency**: Frontend and backend use identical algorithm
- **Latency**: ~100ms per article × 50 articles = ~5s total (acceptable for async processing)

---

### ADR-6: Frontend Polling vs WebSocket for Sentiment Updates

**Decision:** Use **HTTP polling** initially, defer WebSocket to Phase 6 (post-MVP).

**Context:**
- Sentiment jobs typically complete in 5-15 seconds
- WebSocket adds complexity (API Gateway WebSocket API, connection management)
- Polling is simpler and sufficient for infrequent updates

**Rationale:**
- **Simplicity**: HTTP polling requires no new infrastructure
- **Good enough**: 2-second poll interval = max 2-second delay after job completes
- **Cost**: Minimal (10-15 polls = negligible API Gateway cost)
- **Upgrade path**: Can add WebSocket in Phase 6 without breaking changes

**Implementation Pattern:**
```typescript
// Frontend polling (Phase 4)
async function pollForSentiment(jobId: string): Promise<SentimentData> {
  const maxAttempts = 60; // 2 minutes timeout
  const pollInterval = 2000; // 2 seconds

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(`${API_URL}/sentiment/job/${jobId}`);
    const job = await response.json();

    if (job.status === 'COMPLETED') {
      // Fetch results from Lambda
      const results = await fetch(`${API_URL}/sentiment/${ticker}?startDate=${start}&endDate=${end}`);
      return results.json();
    }

    if (job.status === 'FAILED') {
      throw new Error(`Sentiment analysis failed: ${job.error}`);
    }

    // Still processing, wait and retry
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Sentiment analysis timeout');
}
```

**Future Enhancement (Phase 6):**
- API Gateway WebSocket API for real-time updates
- Lambda sends completion message to connected clients
- Reduces polling overhead for slow sentiment jobs

---

## Technical Standards

### Error Handling Pattern

All Lambda functions and repositories use consistent error handling:

```typescript
// Lambda handler pattern
export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayResponse> {
  try {
    // Validate inputs
    const { ticker, startDate, endDate } = validateQueryParams(event.queryStringParameters);

    // Business logic
    const data = await fetchData(ticker, startDate, endDate);

    // Success response
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    };
  } catch (error) {
    // Log error with context
    console.error('[HandlerName] Error:', error, {
      requestId: event.requestContext.requestId,
      ticker,
    });

    // Return appropriate error code
    const statusCode = error instanceof ValidationError ? 400 :
                       error instanceof NotFoundError ? 404 :
                       500;

    return {
      statusCode,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error.message,
        requestId: event.requestContext.requestId,
      }),
    };
  }
}
```

### Testing Patterns

**Unit Tests** (for repositories and utilities):
```typescript
describe('StocksCacheRepository', () => {
  beforeEach(async () => {
    // Clear test table
    await clearTable('StocksCache-test');
  });

  it('should cache stock data and retrieve by ticker+date', async () => {
    const testData = {
      ticker: 'AAPL',
      date: '2025-01-15',
      priceData: { open: 150, close: 155, high: 156, low: 149, volume: 1000000 },
    };

    await StocksCacheRepository.putStock(testData);

    const retrieved = await StocksCacheRepository.getStock('AAPL', '2025-01-15');
    expect(retrieved).toEqual(testData);
  });

  it('should return null for cache miss', async () => {
    const retrieved = await StocksCacheRepository.getStock('NOTFOUND', '2025-01-15');
    expect(retrieved).toBeNull();
  });
});
```

**Integration Tests** (for Lambda endpoints):
```typescript
describe('GET /stocks with DynamoDB caching', () => {
  it('should return cached data on second request', async () => {
    // First request - cache miss
    const response1 = await callLambda({ ticker: 'AAPL', startDate: '2025-01-01', endDate: '2025-01-30' });
    expect(response1.statusCode).toBe(200);
    expect(response1.body.cached).toBe(false);

    // Second request - cache hit
    const response2 = await callLambda({ ticker: 'AAPL', startDate: '2025-01-01', endDate: '2025-01-30' });
    expect(response2.statusCode).toBe(200);
    expect(response2.body.cached).toBe(true);
    expect(response2.body.data).toEqual(response1.body.data);
  });
});
```

### Commit Message Format

Use conventional commits throughout all phases:

```
type(scope): brief description

- Detailed change 1
- Detailed change 2
- Reference to issue/task if applicable
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code restructuring without behavior change
- `test`: Adding or updating tests
- `docs`: Documentation changes
- `chore`: Build, config, or tooling changes

**Scopes:**
- `dynamodb`: DynamoDB table or repository changes
- `lambda`: Lambda function changes
- `frontend`: React Native/Expo changes
- `api`: API endpoint changes
- `cache`: Caching logic changes

**Examples:**
```
feat(dynamodb): add StocksCache table with TTL support

- Define table schema in template.yaml
- Add PK (ticker) and SK (date) attributes
- Configure TTL on `ttl` attribute for 7-day expiration
- Add GSI for date-based queries

Task: Phase 1, Task 1.1
```

```
feat(lambda): implement async sentiment processing endpoint

- Add POST /sentiment endpoint to trigger analysis
- Create SentimentJobs table for job tracking
- Implement job status polling GET /sentiment/job/:jobId
- Add sentiment batch analysis using ported analyzer.ts

Task: Phase 3, Task 3.2
```

---

## Common Pitfalls to Avoid

### DynamoDB Pitfalls

**❌ Don't: Query without consistent read**
```typescript
// Wrong: Eventually consistent read (may return stale data)
const result = await dynamodb.query({ TableName, KeyConditionExpression });
```

**✅ Do: Use ConsistentRead for critical data**
```typescript
// Correct: Strongly consistent read
const result = await dynamodb.query({
  TableName,
  KeyConditionExpression,
  ConsistentRead: true, // Add this for fresh data
});
```

**❌ Don't: Forget to handle DynamoDB-specific errors**
```typescript
// Wrong: Generic catch
try {
  await dynamodb.putItem(params);
} catch (error) {
  console.error('Error:', error);
}
```

**✅ Do: Handle conditional check failures, provisioned throughput exceeded**
```typescript
// Correct: Specific error handling
try {
  await dynamodb.putItem(params);
} catch (error) {
  if (error.name === 'ConditionalCheckFailedException') {
    // Item already exists, handle idempotently
  } else if (error.name === 'ProvisionedThroughputExceededException') {
    // Retry with exponential backoff
  } else {
    throw error;
  }
}
```

### Lambda Pitfalls

**❌ Don't: Reuse DynamoDB client without proper initialization**
```typescript
// Wrong: Client may not be initialized
const dynamodb = new DynamoDBClient();

export async function handler(event) {
  const result = await dynamodb.send(new GetItemCommand(params)); // May fail
}
```

**✅ Do: Initialize client outside handler for reuse across invocations**
```typescript
// Correct: Client initialized once, reused across warm starts
const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION });

export async function handler(event) {
  const result = await dynamodb.send(new GetItemCommand(params));
}
```

**❌ Don't: Forget to enable CORS for frontend requests**
```typescript
// Wrong: No CORS headers
return {
  statusCode: 200,
  body: JSON.stringify(data),
};
```

**✅ Do: Include CORS headers in all responses**
```typescript
// Correct: CORS headers for frontend access
return {
  statusCode: 200,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*', // Or specific origin
  },
  body: JSON.stringify(data),
};
```

### Frontend Pitfalls

**❌ Don't: Poll indefinitely without timeout**
```typescript
// Wrong: Infinite loop if job never completes
while (true) {
  const job = await checkJobStatus(jobId);
  if (job.status === 'COMPLETED') break;
  await sleep(2000);
}
```

**✅ Do: Set max attempts and timeout**
```typescript
// Correct: Timeout after 60 attempts (2 minutes)
for (let i = 0; i < 60; i++) {
  const job = await checkJobStatus(jobId);
  if (job.status === 'COMPLETED') return job;
  await sleep(2000);
}
throw new Error('Job timeout');
```

**❌ Don't: Show error immediately on cache miss**
```typescript
// Wrong: User sees error flash before data loads
const { data, isLoading, error } = useQuery({
  queryKey: ['sentiment', ticker],
  queryFn: () => fetchSentiment(ticker),
});

if (error) return <ErrorDisplay error={error} />; // Bad UX
```

**✅ Do: Show loading state while fetching from Lambda**
```typescript
// Correct: Show spinner during async fetch
const { data, isLoading, error } = useQuery({
  queryKey: ['sentiment', ticker],
  queryFn: () => fetchSentiment(ticker),
  retry: 3, // Retry on transient failures
});

if (isLoading) return <LoadingSpinner message="Analyzing sentiment..." />;
if (error) return <ErrorDisplay error={error} />;
```

---

## Shared Utilities to Create

These utilities will be used across multiple phases:

### `backend/src/utils/dynamodb.util.ts`
- `buildUpdateExpression(updates: Record<string, any>)` - Generate DynamoDB update expressions
- `batchGetItems(tableName: string, keys: any[])` - Handle batch reads with pagination
- `batchPutItems(tableName: string, items: any[])` - Handle batch writes (max 25 items)
- `withRetry(fn: () => Promise<T>, maxRetries: number)` - Exponential backoff retry

### `backend/src/utils/cache.util.ts`
- `calculateTTL(daysFromNow: number)` - Generate Unix timestamp for DynamoDB TTL
- `isCacheFresh(item: CacheItem, maxAgeMs: number)` - Check if cached item is fresh
- `generateCacheKey(ticker: string, date: string)` - Consistent key generation

### `backend/src/utils/job.util.ts`
- `generateJobId(ticker: string, startDate: string, endDate: string)` - Deterministic job ID
- `parseJobId(jobId: string)` - Extract ticker and date range from job ID

### `src/services/api/lambda.service.ts` (Frontend)
- `callLambdaEndpoint(path: string, params: Record<string, string>)` - Wrapper for Lambda API calls
- `pollJobStatus(jobId: string, maxAttempts: number)` - Generic job polling logic

---

## Performance Benchmarks

Measure and track these metrics throughout implementation:

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Sentiment load time (30 days) | 45s | <3s | Time from search to sentiment tab data displayed |
| Cache hit rate (popular stocks) | 0% | >90% | DynamoDB reads / total requests |
| API calls (100 users, same stock) | 100 | <10 | Tiingo/Polygon requests / unique stock |
| Offline mode functionality | ✅ | ✅ | App works without network after initial sync |
| Lambda cold start | N/A | <500ms | First invocation after deploy |
| Lambda warm execution | N/A | <200ms | Cached data retrieval |

---

## Next Steps

After reviewing Phase 0:

1. **Proceed to Phase 1**: DynamoDB table creation and IAM setup
2. **Bookmark this file**: Refer back to ADRs when making implementation decisions
3. **Set up testing tools**: Install DynamoDB Local if developing without AWS connection

**Ready?** → **[Phase 1: DynamoDB Foundation](./Phase-1.md)**
