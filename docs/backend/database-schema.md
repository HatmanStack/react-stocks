# Database Schema Documentation

Complete reference for DynamoDB tables, schemas, and access patterns in the stock tracking backend.

## Table of Contents

- [Overview](#overview)
- [Tables](#tables)
  - [SentimentCache](#sentimentcache)
  - [NewsCache](#newscache)
  - [StocksCache](#stockscache)
  - [SentimentJobs](#sentimentjobs)
- [Access Patterns](#access-patterns)
- [Indexes](#indexes)
- [TTL Behavior](#ttl-behavior)
- [Migration Strategy](#migration-strategy)

---

## Overview

The backend uses DynamoDB for caching frequently accessed data to reduce API calls and improve performance. All tables use TTL for automatic expiration of stale data.

**Key Design Principles:**
- **Cache-first**: Check cache before external APIs
- **TTL-based expiration**: Auto-cleanup of stale data
- **Partition by ticker**: Efficient queries per stock
- **Optimistic caching**: Store results immediately after fetching

---

## Tables

### SentimentCache

Stores article-level sentiment analysis results with three-signal architecture (Phase 4).

**Table Name:** `SentimentCache` (configurable via `SENTIMENT_CACHE_TABLE` env var)

**Schema:**

| Field | Type | Description | Required | Added |
|-------|------|-------------|----------|-------|
| `ticker` | String | Stock ticker symbol (PK) | ✓ | v1.0 |
| `articleHash` | String | Unique article hash (SK) | ✓ | v1.0 |
| `sentiment` | Object | Legacy sentiment data | ✓ | v1.0 |
| `sentiment.positive` | Number | Positive sentence count | ✓ | v1.0 |
| `sentiment.negative` | Number | Negative sentence count | ✓ | v1.0 |
| `sentiment.sentimentScore` | Number | Overall score (-1 to +1) | ✓ | v1.0 |
| `sentiment.classification` | String | POS/NEG/NEUT | ✓ | v1.0 |
| `analyzedAt` | Number | Unix timestamp (ms) | ✓ | v1.0 |
| `ttl` | Number | TTL timestamp (seconds) | ✓ | v1.0 |
| `eventType` | String | Event classification | ✗ | Phase 1 |
| `aspectScore` | Number | Aspect score (-1 to +1) | ✗ | Phase 2 |
| `aspectBreakdown` | Object | Per-aspect scores | ✗ | Phase 2 |
| `aspectBreakdown.REVENUE` | Number | Revenue aspect score | ✗ | Phase 2 |
| `aspectBreakdown.EARNINGS` | Number | Earnings aspect score | ✗ | Phase 2 |
| `aspectBreakdown.GUIDANCE` | Number | Guidance aspect score | ✗ | Phase 2 |
| `aspectBreakdown.MARGINS` | Number | Margins aspect score | ✗ | Phase 2 |
| `aspectBreakdown.GROWTH` | Number | Growth aspect score | ✗ | Phase 2 |
| `aspectBreakdown.DEBT` | Number | Debt aspect score | ✗ | Phase 2 |
| `distilFinBERTScore` | Number | DistilFinBERT score (-1 to +1) | ✗ | Phase 3 |
| `modelVersion` | String | Model version identifier | ✗ | Phase 3 |

**Indexes:**
- **Primary Key:** `ticker` (HASH) + `articleHash` (RANGE)
- **GSI:** None (queries are by ticker)

**TTL:**
- **Duration:** 90 days (sentiment is timeless)
- **Field:** `ttl` (Unix timestamp in seconds)
- **Rationale:** Long TTL since sentiment doesn't change; allows cache warming

**Example Item:**

```json
{
  "ticker": "AAPL",
  "articleHash": "3f8a9b2c1d",
  "sentiment": {
    "positive": 15,
    "negative": 3,
    "sentimentScore": 0.67,
    "classification": "POS"
  },
  "analyzedAt": 1704067200000,
  "ttl": 1711929600,
  "eventType": "EARNINGS",
  "aspectScore": 0.45,
  "aspectBreakdown": {
    "REVENUE": 0.7,
    "EARNINGS": 0.3,
    "GUIDANCE": 0.6
  },
  "distilFinBERTScore": 0.72,
  "modelVersion": "distilfinbert-v1.0"
}
```

**Access Patterns:**

1. **Check if sentiment exists** (duplicate prevention):
   ```typescript
   const exists = await existsInCache('AAPL', 'hash123');
   ```

2. **Get single article sentiment**:
   ```typescript
   const sentiment = await getSentiment('AAPL', 'hash123');
   ```

3. **Get all sentiments for ticker**:
   ```typescript
   const sentiments = await querySentimentsByTicker('AAPL');
   ```

4. **Store sentiment analysis result**:
   ```typescript
   await putSentiment({
     ticker: 'AAPL',
     articleHash: 'hash123',
     sentiment: { /* ... */ },
     eventType: 'EARNINGS',
     aspectScore: 0.45,
     distilFinBERTScore: 0.72,
     analyzedAt: Date.now(),
   });
   ```

5. **Batch store sentiments** (no duplicate prevention):
   ```typescript
   await batchPutSentiments([/* array of items */]);
   ```

---

### NewsCache

Stores news articles fetched from Finnhub API.

**Table Name:** `NewsCache` (configurable via `NEWS_CACHE_TABLE` env var)

**Schema:**

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `ticker` | String | Stock ticker symbol (PK) | ✓ |
| `articleHash` | String | Unique article hash (SK) | ✓ |
| `article` | Object | Article data | ✓ |
| `article.title` | String | Article headline | ✓ |
| `article.url` | String | Article URL | ✓ |
| `article.description` | String | Article summary | ✗ |
| `article.date` | String | Publish date (YYYY-MM-DD) | ✓ |
| `article.publisher` | String | News source | ✗ |
| `article.imageUrl` | String | Article image URL | ✗ |
| `fetchedAt` | Number | Unix timestamp (ms) | ✓ |
| `ttl` | Number | TTL timestamp (seconds) | ✓ |

**TTL:**
- **Duration:** 30 days
- **Rationale:** News becomes stale quickly; balance freshness with API costs

**Example Item:**

```json
{
  "ticker": "AAPL",
  "articleHash": "a1b2c3d4e5",
  "article": {
    "title": "Apple Reports Strong Q1 Earnings",
    "url": "https://example.com/article",
    "description": "Apple Inc. beat analyst estimates...",
    "date": "2025-01-15",
    "publisher": "Reuters",
    "imageUrl": "https://example.com/image.jpg"
  },
  "fetchedAt": 1704067200000,
  "ttl": 1706745600
}
```

---

### StocksCache

Stores stock price data fetched from Tiingo API.

**Table Name:** `StocksCache` (configurable via `STOCKS_CACHE_TABLE` env var)

**Schema:**

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `ticker` | String | Stock ticker symbol (PK) | ✓ |
| `date` | String | Price date YYYY-MM-DD (SK) | ✓ |
| `priceData` | Object | OHLCV data | ✓ |
| `priceData.open` | Number | Opening price | ✓ |
| `priceData.high` | Number | High price | ✓ |
| `priceData.low` | Number | Low price | ✓ |
| `priceData.close` | Number | Closing price | ✓ |
| `priceData.volume` | Number | Trading volume | ✓ |
| `fetchedAt` | Number | Unix timestamp (ms) | ✓ |
| `ttl` | Number | TTL timestamp (seconds) | ✓ |

**TTL:**
- **Duration:** 7 days
- **Rationale:** Price data is historical and doesn't change

---

### SentimentJobs

Tracks sentiment analysis jobs for async processing and status polling.

**Table Name:** `SentimentJobs` (configurable via `SENTIMENT_JOBS_TABLE` env var)

**Schema:**

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `jobId` | String | Deterministic job ID (PK) | ✓ |
| `status` | String | IN_PROGRESS/COMPLETED/FAILED | ✓ |
| `ticker` | String | Stock ticker symbol | ✓ |
| `startDate` | String | Date range start (YYYY-MM-DD) | ✓ |
| `endDate` | String | Date range end (YYYY-MM-DD) | ✓ |
| `startedAt` | Number | Unix timestamp (ms) | ✓ |
| `completedAt` | Number | Unix timestamp (ms) | ✗ |
| `articlesProcessed` | Number | Count of articles analyzed | ✗ |
| `error` | String | Error message if failed | ✗ |
| `ttl` | Number | TTL timestamp (seconds) | ✓ |

**Job ID Format:**
```typescript
jobId = `${ticker}_${startDate}_${endDate}`
// Example: AAPL_2025-01-01_2025-01-31
```

**TTL:**
- **Duration:** 1 day
- **Rationale:** Job status only relevant for short period; auto-cleanup reduces clutter

---

## Access Patterns

### Pattern 1: Fetch and Cache

**Use Case:** Get data, falling back to external API if not cached

```typescript
// Check cache first
const cached = await getFromCache(ticker, date);
if (cached) {
  return cached;
}

// Cache miss - fetch from API
const data = await fetchFromExternalAPI(ticker, date);

// Store in cache
await putInCache(data);

return data;
```

### Pattern 2: Bulk Query

**Use Case:** Get all items for a ticker (e.g., all news articles)

```typescript
const allItems = await queryByTicker('AAPL');
// Returns all items with ticker = 'AAPL'
```

### Pattern 3: Date Range Filter

**Use Case:** Filter cached items by date range (application-level)

```typescript
const allItems = await queryByTicker('AAPL');
const filtered = allItems.filter(item =>
  item.date >= startDate && item.date <= endDate
);
```

### Pattern 4: Duplicate Prevention

**Use Case:** Avoid reprocessing articles

```typescript
// Check if already analyzed
const exists = await existsInCache(ticker, articleHash);
if (exists) {
  return; // Skip
}

// Analyze and store
const sentiment = await analyzeSentiment(article);
await putSentiment(sentiment);
```

---

## Indexes

### Primary Keys

All tables use **composite primary keys**:

- **Partition Key (HASH):** `ticker` - Enables efficient per-ticker queries
- **Sort Key (RANGE):** Varies by table:
  - SentimentCache: `articleHash`
  - NewsCache: `articleHash`
  - StocksCache: `date`
  - SentimentJobs: N/A (simple primary key: `jobId`)

### Global Secondary Indexes (GSI)

**None currently implemented.**

**Future Considerations:**
- GSI on `date` for cross-ticker queries (expensive, rarely needed)
- GSI on `eventType` for event-based analytics (Phase 5+)

---

## TTL Behavior

### What is TTL?

DynamoDB Time-To-Live (TTL) automatically deletes items after expiration. TTL is free and runs in the background.

### TTL Field

All tables use `ttl` field containing Unix timestamp in **seconds** (not milliseconds).

### Expiration Times

| Table | TTL Duration | Rationale |
|-------|--------------|-----------|
| SentimentCache | 90 days | Sentiment is timeless; long TTL for cache warming |
| NewsCache | 30 days | News becomes stale; balance freshness with API costs |
| StocksCache | 7 days | Price data is historical and doesn't change |
| SentimentJobs | 1 day | Job status only relevant briefly; reduce clutter |

### TTL Calculation

```typescript
import { calculateTTL } from '../utils/cache.util';

const ttl = calculateTTL(90); // 90 days from now (in seconds)
```

### TTL Guarantees

- **Eventual consistency**: Items deleted within 48 hours of expiration
- **Reads may return expired items**: Check `ttl` manually if critical
- **No cost**: TTL deletion is free

---

## Migration Strategy

### Schema Evolution (Phase 4)

New fields added to SentimentCache:
- `eventType` (Phase 1)
- `aspectScore`, `aspectBreakdown` (Phase 2)
- `distilFinBERTScore`, `modelVersion` (Phase 3)

**Backward Compatibility:**

All new fields are **optional**. Old cache items remain valid without new fields.

**Migration Options:**

1. **Natural Expiration (Recommended)**
   - Do nothing
   - Old items expire via TTL (90 days)
   - New analysis populates new fields
   - **Pro:** Zero effort, no downtime
   - **Con:** Gradual migration (90 days)

2. **Backfill Script**
   - Scan table for items missing new fields
   - Re-analyze using new pipeline
   - Update items in place
   - **Pro:** Immediate availability
   - **Con:** Expensive (scan + API calls)

3. **Hybrid Approach**
   - Accept missing fields with defaults
   - Use type guards to check field existence
   - Example:
     ```typescript
     const eventType = item.eventType ?? 'GENERAL';
     const aspectScore = item.aspectScore ?? 0;
     const finBERTScore = item.distilFinBERTScore ?? item.sentiment.sentimentScore;
     ```

**Chosen Strategy:** Natural expiration (Option 1)

### Handling Missing Fields

Use helper functions from `src/types/sentiment.types.ts`:

```typescript
import { hasMultiSignalData, getSentimentSignals } from '../types/sentiment.types';

const item = await getSentiment('AAPL', 'hash123');

// Type guard
if (hasMultiSignalData(item)) {
  // Safe to access item.eventType, item.aspectScore
  console.log(item.eventType);
}

// Safe extraction with defaults
const { eventType, aspectScore, finBERTScore } = getSentimentSignals(item);
```

---

## Query Examples

### Get Single Item

```typescript
import * as SentimentCacheRepository from '../repositories/sentimentCache.repository';

const sentiment = await SentimentCacheRepository.getSentiment('AAPL', 'hash123');

if (sentiment) {
  console.log('Event type:', sentiment.eventType ?? 'GENERAL');
  console.log('Aspect score:', sentiment.aspectScore ?? 0);
  console.log('DistilFinBERT score:', sentiment.distilFinBERTScore ?? 'N/A');
}
```

### Query All Items for Ticker

```typescript
const allSentiments = await SentimentCacheRepository.querySentimentsByTicker('AAPL');

console.log(`Found ${allSentiments.length} sentiment items for AAPL`);

// Filter by event type
const earningsArticles = allSentiments.filter(s => s.eventType === 'EARNINGS');
```

### Batch Insert

```typescript
const items = [
  {
    ticker: 'AAPL',
    articleHash: 'hash1',
    sentiment: { positive: 10, negative: 2, sentimentScore: 0.67, classification: 'POS' },
    eventType: 'EARNINGS',
    aspectScore: 0.5,
    analyzedAt: Date.now(),
  },
  // ... more items
];

await SentimentCacheRepository.batchPutSentiments(items);
```

### Aggregate Daily Sentiment

```typescript
import { aggregateDailySentiment } from '../utils/sentiment.util';
import * as SentimentCacheRepository from '../repositories/sentimentCache.repository';
import * as NewsCacheRepository from '../repositories/newsCache.repository';

const sentiments = await SentimentCacheRepository.querySentimentsByTicker('AAPL');
const articles = await NewsCacheRepository.queryArticlesByTicker('AAPL');

const dailySentiment = aggregateDailySentiment(sentiments, articles);

// dailySentiment includes:
// - positiveCount, negativeCount, sentimentScore (legacy)
// - eventCounts (Phase 4)
// - avgAspectScore, avgFinBERTScore, materialEventCount (Phase 4)
```

---

## Performance Considerations

### Read Performance

- **Single item get**: ~10ms (GetItem)
- **Query by ticker**: ~50-200ms (depends on item count)
- **Batch get**: ~20-50ms (BatchGetItem, up to 100 items)

### Write Performance

- **Single put**: ~10ms (PutItem)
- **Batch write**: ~20-100ms (BatchWriteItem, up to 25 items)
- **Conditional put**: +5ms (duplicate prevention)

### Cost Optimization

1. **Use cache effectively**
   - Check cache before API calls
   - Accept stale data within TTL window

2. **Batch operations**
   - Use `batchPutSentiments` for bulk writes
   - Reduces API calls and improves throughput

3. **TTL for cleanup**
   - Automatic deletion (free)
   - No manual cleanup needed

4. **Avoid scans**
   - Always query by ticker (partition key)
   - Never scan full table

---

## Troubleshooting

### Item Not Found

**Possible causes:**
1. Item expired (TTL)
2. Item never cached
3. Wrong partition/sort key

**Solution:**
```typescript
const item = await getSentiment('AAPL', 'hash123');
if (!item) {
  console.log('Cache miss - item not found or expired');
  // Fetch from source and cache
}
```

### Missing New Fields

**Expected behavior:** Old items don't have Phase 4 fields.

**Solution:** Use defaults:
```typescript
const eventType = item.eventType ?? 'GENERAL';
const aspectScore = item.aspectScore ?? 0;
```

### Conditional Put Failed

**Cause:** Duplicate prevention - item already exists

**Solution:** This is normal. Ignore ConditionalCheckFailedException:
```typescript
try {
  await putSentiment(item);
} catch (error) {
  if (error.name === 'ConditionalCheckFailedException') {
    console.log('Item already exists - skipping');
    return; // Not an error
  }
  throw error;
}
```

---

## References

- [DynamoDB Developer Guide](https://docs.aws.amazon.com/dynamodb/)
- [Phase 4 Implementation Plan](../docs/plans/Phase-4.md)
- [Sentiment Types Documentation](../src/types/sentiment.types.ts)
- [Repository Pattern](../src/repositories/README.md)
