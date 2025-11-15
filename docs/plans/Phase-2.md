# Phase 2: Lambda Caching Layer

## Phase Goal

Integrate DynamoDB caching into existing Lambda endpoints (`/stocks` and `/news`) to eliminate redundant API calls to Tiingo and Finnhub. Implement three-tier lookup pattern: check DynamoDB cache first, fetch from external APIs on cache miss, then cache results for future requests.

**Success Criteria:**
- ✅ `/stocks` endpoint checks StocksCache before calling Tiingo
- ✅ `/news` endpoint checks NewsCache before calling Finnhub
- ✅ Cache hit rate >90% for popular stocks after initial fetch
- ✅ Response includes `cached: true/false` metadata
- ✅ Backward compatibility preserved (same response format)
- ✅ Integration tests validate caching behavior

**Estimated tokens:** ~40,000

---

## Prerequisites

- **Phase 1 complete**: DynamoDB tables deployed, repositories functional
- **All Phase 1 tests passing**: Repositories tested and working
- **Backend deployed**: Existing Lambda function operational
- **API testing tool**: Postman, curl, or similar for endpoint testing

---

## Tasks

### Task 2.1: Refactor Stocks Handler to Use Cache

**Goal:** Modify `/stocks` endpoint to check StocksCache before calling Tiingo API, implementing the three-tier lookup pattern.

**Files to Modify:**
- `backend/src/handlers/stocks.handler.ts` - Add caching logic
- `backend/src/services/tiingo.service.ts` - Extract API call logic (if needed)

**Prerequisites:**
- Review Phase-0.md ADR-1 for three-tier lookup pattern
- Review current `stocks.handler.ts` implementation

**Implementation Steps:**

1. **Import StocksCache repository** at top of file:
   ```typescript
   import { StocksCacheRepository } from '@/repositories';
   ```

2. **Extract query parameter parsing**:
   - Parse `ticker`, `startDate`, `endDate` (or `type=metadata`) from query params
   - Validate required parameters (return 400 if missing)
   - Normalize ticker to uppercase

3. **Implement three-tier lookup for price data**:
   - **Tier 1**: Check DynamoDB cache for all dates in range
     - Use `batchGetStocks(ticker, dates)` for date range
     - If cache hit rate >80%, use cached data
   - **Tier 2**: Fetch missing dates from Tiingo API
     - Only call API for cache-missed dates
     - Transform Tiingo response to match cache schema
   - **Tier 3**: Cache fetched data in DynamoDB
     - Use `batchPutStocks()` to cache all fetched prices
     - Set TTL to 7 days from now

4. **Implement caching for metadata** (`type=metadata`):
   - Check cache for ticker metadata
   - If cache miss, fetch from Tiingo metadata endpoint
   - Cache result with 7-day TTL

5. **Add cache metadata to response**:
   - Return `{ data: [...], cached: boolean, cacheHitRate: number }` for debugging
   - `cached: true` if 100% cache hit, `false` if any API calls made
   - `cacheHitRate`: Percentage of dates found in cache

6. **Preserve backward compatibility**:
   - Response format should match current structure
   - Cache metadata added under `_meta` key (optional, for debugging)

7. **Add error handling**:
   - If DynamoDB fails, fall back to direct API call
   - Log cache errors but don't fail request
   - Return `cached: false` if cache error occurred

**Verification Checklist:**
- [ ] Query parameter validation returns 400 for missing/invalid params
- [ ] Cache checked before API call for all requests
- [ ] Partial cache hits result in API call for missing dates only
- [ ] All fetched data cached in DynamoDB with 7-day TTL
- [ ] Response format matches existing structure (backward compatible)
- [ ] Cache metadata included in response for debugging
- [ ] Error handling falls back to API call if cache fails

**Testing Instructions:**

Create integration tests in `backend/src/handlers/__tests__/stocks.handler.integration.test.ts`:

- **Test cache miss flow**:
  - Clear DynamoDB cache
  - Call `/stocks?ticker=AAPL&startDate=2025-01-01&endDate=2025-01-30`
  - Verify response has `cached: false`
  - Verify data returned matches Tiingo API response
  - Verify data now cached in DynamoDB

- **Test cache hit flow**:
  - Call same request again
  - Verify response has `cached: true`
  - Verify data matches first request
  - Verify no Tiingo API call made (mock Tiingo service)

- **Test partial cache hit**:
  - Cache data for 15 dates
  - Request 30 dates
  - Verify only 15 dates fetched from API
  - Verify `cacheHitRate: 0.5` in response

- **Test metadata caching**:
  - Request `/stocks?ticker=AAPL&type=metadata`
  - Verify metadata cached
  - Second request returns cached metadata

Run tests: `cd backend && npm test -- handlers/stocks.handler.integration`

**Commit Message Template:**
```
feat(lambda): integrate DynamoDB caching in stocks endpoint

- Implement three-tier lookup: DynamoDB → Tiingo API → Cache result
- Batch check cache for date range queries
- Fetch only cache-missed dates from Tiingo API
- Auto-cache all fetched data with 7-day TTL
- Add cache metadata to response (cached, cacheHitRate)
- Preserve backward compatibility with existing response format
- Add comprehensive integration tests for cache flows

Task: Phase 2, Task 2.1
```

**Estimated tokens:** ~8,000

---

### Task 2.2: Refactor News Handler to Use Cache

**Goal:** Modify `/news` endpoint to check NewsCache before calling Finnhub API, implementing deduplication and caching.

**Files to Modify:**
- `backend/src/handlers/news.handler.ts` - Add caching logic
- `backend/src/services/finnhub.service.ts` - Ensure article hashing (if not already implemented)

**Prerequisites:**
- Task 2.1 complete (reference caching pattern)
- Review current `news.handler.ts` implementation

**Implementation Steps:**

1. **Import NewsCache repository**:
   ```typescript
   import { NewsCacheRepository } from '@/repositories';
   import { generateArticleHash } from '@/utils/hash.util'; // Create if needed
   ```

2. **Parse query parameters**:
   - Extract `ticker`, `limit` (default: 50)
   - Validate ticker is provided (return 400 if missing)

3. **Implement three-tier lookup for news**:
   - **Tier 1**: Query DynamoDB for cached articles by ticker
     - Use `queryArticlesByTicker(ticker)` to get all cached articles
     - Filter articles by date if date range provided
   - **Tier 2**: Check if cache is sufficient
     - If cached articles count >= requested limit, return cached articles
     - If insufficient, fetch from Finnhub API
   - **Tier 3**: Fetch and cache new articles
     - Call Finnhub API for latest articles
     - Generate article hash for each article (hash URL for uniqueness)
     - Filter out articles already in cache using `existsInCache()`
     - Cache only new articles using `batchPutArticles()`

4. **Implement article hashing**:
   - Create `generateArticleHash(url: string): string` utility
   - Use simple hash function (e.g., MD5 or SHA256 of URL)
   - Ensures consistent hash for same article across users

5. **Add pagination support**:
   - Return up to `limit` articles from cache + API
   - Sort by date descending (most recent first)

6. **Add cache metadata**:
   - Return `{ articles: [...], cached: boolean, newArticles: number }`
   - `cached: true` if all articles from cache, `false` if API called
   - `newArticles`: Count of articles fetched from API and cached

**Verification Checklist:**
- [ ] Article hash function generates consistent hashes
- [ ] Duplicate articles not cached (checked via existsInCache)
- [ ] Cache checked before API call
- [ ] New articles cached with 30-day TTL
- [ ] Response sorted by date descending
- [ ] Cache metadata included in response
- [ ] Backward compatibility preserved

**Testing Instructions:**

Create integration tests in `backend/src/handlers/__tests__/news.handler.integration.test.ts`:

- **Test cache miss flow**:
  - Clear NewsCache
  - Call `/news?ticker=AAPL&limit=20`
  - Verify response has `cached: false`
  - Verify 20 articles returned
  - Verify all articles cached in DynamoDB

- **Test cache hit flow**:
  - Call same request again
  - Verify response has `cached: true`
  - Verify same articles returned
  - Verify no Finnhub API call

- **Test duplicate prevention**:
  - Cache 10 articles
  - API returns same 10 articles + 5 new
  - Verify only 5 new articles cached
  - Verify `newArticles: 5` in response

- **Test article hashing**:
  - Verify same URL generates same hash
  - Verify different URLs generate different hashes

Run tests: `cd backend && npm test -- handlers/news.handler.integration`

**Commit Message Template:**
```
feat(lambda): integrate DynamoDB caching in news endpoint

- Implement three-tier lookup: DynamoDB → Finnhub API → Cache result
- Add article hashing for deduplication
- Filter duplicate articles using existsInCache check
- Cache only new articles with 30-day TTL
- Add cache metadata (cached, newArticles) to response
- Preserve backward compatibility
- Comprehensive integration tests for caching flows

Task: Phase 2, Task 2.2
```

**Estimated tokens:** ~7,500

---

### Task 2.3: Create Article Hashing Utility

**Goal:** Implement consistent article hashing function to generate unique identifiers for news articles.

**Files to Create:**
- `backend/src/utils/hash.util.ts` - Hashing utilities
- `backend/src/utils/__tests__/hash.util.test.ts` - Unit tests

**Prerequisites:**
- Task 2.2 planning complete (understand hashing requirements)

**Implementation Steps:**

1. **Create hash function**:
   - Implement `generateArticleHash(url: string): string`
   - Use Node.js crypto module: `crypto.createHash('sha256').update(url).digest('hex')`
   - Return first 16 characters of hash (sufficient for uniqueness)

2. **Add hash validation**:
   - Implement `isValidHash(hash: string): boolean` to validate hash format
   - Check length and characters (should be hex string)

3. **Add bulk hashing**:
   - Implement `generateArticleHashes(urls: string[]): string[]` for batch operations
   - Map array of URLs to array of hashes

4. **Consider edge cases**:
   - Handle empty URL (throw error or return special hash)
   - Handle URL normalization (lowercase, trim whitespace)

**Verification Checklist:**
- [ ] Hash function generates consistent output for same input
- [ ] Hash length is reasonable (16 characters)
- [ ] Different URLs generate different hashes
- [ ] Hash is collision-resistant (use SHA256, not MD5)
- [ ] Edge cases handled (empty URL, special characters)

**Testing Instructions:**

Create unit tests:

- **Test consistency**:
  - Hash same URL 100 times, verify identical output

- **Test uniqueness**:
  - Hash 1000 different URLs, verify no collisions

- **Test edge cases**:
  - Empty URL returns error or special value
  - URLs with special characters handled correctly

- **Test bulk hashing**:
  - Hash array of 100 URLs, verify all unique

Run tests: `cd backend && npm test -- utils/hash.util`

**Commit Message Template:**
```
feat(utils): create article hashing utility for deduplication

- Implement SHA256-based hash generation for article URLs
- Add validation for hash format
- Support bulk hashing for batch operations
- Handle edge cases (empty URL, special characters)
- Comprehensive unit tests ensuring consistency and uniqueness

Task: Phase 2, Task 2.3
```

**Estimated tokens:** ~3,000

---

### Task 2.4: Add Cache Performance Metrics

**Goal:** Instrument Lambda handlers with CloudWatch metrics to track cache hit rates and performance.

**Files to Modify:**
- `backend/src/handlers/stocks.handler.ts` - Add metrics
- `backend/src/handlers/news.handler.ts` - Add metrics
- `backend/src/utils/metrics.util.ts` - Create metrics utility (new file)

**Prerequisites:**
- Tasks 2.1-2.2 complete (handlers using cache)
- Understand AWS CloudWatch Embedded Metrics Format (EMF)

**Implementation Steps:**

1. **Create metrics utility** (`metrics.util.ts`):
   - Implement `logMetric(name: string, value: number, unit: string, dimensions?: Record<string, string>)` using CloudWatch EMF
   - Use `console.log()` with EMF JSON format (Lambda auto-detects and parses)
   - Add dimensions for ticker, endpoint, cacheHit

2. **Add metrics to stocks handler**:
   - Log `CacheHitRate` metric with value 0-100
   - Log `ApiCallCount` metric (number of API calls made)
   - Log `CacheReadLatency` metric (time to check cache)
   - Add dimensions: `{ Endpoint: 'stocks', Ticker: ticker }`

3. **Add metrics to news handler**:
   - Log `CacheHitRate` metric
   - Log `NewArticleCount` metric (new articles cached)
   - Log `DuplicateArticleCount` metric (articles already cached)
   - Add dimensions: `{ Endpoint: 'news', Ticker: ticker }`

4. **Add request duration tracking**:
   - Log `RequestDuration` metric (total handler execution time)
   - Compare cached vs uncached request durations

**Verification Checklist:**
- [ ] Metrics logged using CloudWatch EMF format
- [ ] Dimensions include endpoint and ticker for filtering
- [ ] Metrics appear in CloudWatch Console after deployment
- [ ] No performance impact from metrics logging (<1ms overhead)

**Testing Instructions:**

- **Test metrics format**:
  - Verify EMF JSON format matches CloudWatch spec
  - Example: `{"_aws": {"Timestamp": ..., "CloudWatchMetrics": [...]}}`

- **Test metrics in CloudWatch** (after deployment):
  - Deploy Lambda with metrics
  - Make test requests
  - Check CloudWatch Console → Metrics → Custom Namespaces
  - Verify metrics appear under `ReactStocks` namespace

Run tests: `cd backend && npm test -- utils/metrics.util`

**Commit Message Template:**
```
feat(metrics): add CloudWatch metrics for cache performance

- Create metrics utility using CloudWatch EMF format
- Log CacheHitRate, ApiCallCount, RequestDuration metrics
- Add dimensions for endpoint and ticker filtering
- Instrument stocks and news handlers with metrics
- Enable monitoring of cache performance in CloudWatch

Task: Phase 2, Task 2.4
```

**Estimated tokens:** ~4,000

---

### Task 2.5: Implement Cache Warming Strategy

**Goal:** Create a Lambda function or script to pre-warm cache for popular stocks, improving cache hit rate for common requests.

**Files to Create:**
- `backend/src/handlers/cacheWarm.handler.ts` - Cache warming Lambda (optional)
- `backend/scripts/warm-cache.ts` - Script to warm cache (alternative)

**Prerequisites:**
- Task 2.2 complete (caching implemented)
- Understand Lambda scheduling with EventBridge (if using Lambda)

**Implementation Steps:**

1. **Choose implementation approach**:
   - **Option A**: Scheduled Lambda (runs daily to warm cache)
   - **Option B**: Manual script (run on-demand via `npm run warm-cache`)
   - Recommend Option B for MVP (simpler, no additional AWS resources)

2. **Create cache warming script**:
   - Define list of popular tickers (e.g., AAPL, GOOGL, MSFT, TSLA, AMZN)
   - For each ticker:
     - Fetch last 30 days of stock prices
     - Fetch last 50 news articles
     - Cache results in DynamoDB

3. **Add script to package.json**:
   - Add `"warm-cache": "ts-node scripts/warm-cache.ts"` to scripts section
   - Ensure script uses same repositories as Lambda

4. **Add progress logging**:
   - Log ticker being warmed
   - Log cache hit rate (if already cached, skip)
   - Log total time for cache warming

**Verification Checklist:**
- [ ] Script can be run locally: `npm run warm-cache`
- [ ] Popular stocks cached after running script
- [ ] Script is idempotent (safe to run multiple times)
- [ ] Progress logged to console

**Testing Instructions:**

- **Test script execution**:
  - Clear cache
  - Run `npm run warm-cache`
  - Verify popular stocks cached in DynamoDB

- **Test idempotency**:
  - Run script twice
  - Second run should be faster (cache hits)

**Commit Message Template:**
```
feat(cache): add cache warming script for popular stocks

- Create script to pre-warm cache for top 10 tickers
- Fetch 30 days of prices and 50 news articles per ticker
- Add npm script `warm-cache` for manual execution
- Log progress and cache hit rates
- Idempotent implementation (safe to run multiple times)

Task: Phase 2, Task 2.5
```

**Estimated tokens:** ~3,500

---

### Task 2.6: Add Cache Invalidation Endpoint (Optional)

**Goal:** Create admin endpoint to invalidate cache for specific tickers, useful for debugging and cache corruption recovery.

**Files to Create:**
- `backend/src/handlers/cacheInvalidate.handler.ts` - Cache invalidation endpoint
- Update `backend/template.yaml` - Add `/cache/invalidate` route
- Update `backend/src/index.ts` - Route invalidation requests

**Prerequisites:**
- Phase 1 complete (repositories have delete methods)
- Understand security implications (this endpoint should be protected)

**Implementation Steps:**

1. **Create invalidation handler**:
   - Accept `ticker` query parameter
   - Delete all cached items for ticker:
     - Delete from StocksCache
     - Delete from NewsCache
     - Delete from SentimentCache
   - Return `{ invalidated: true, ticker: string, itemsDeleted: number }`

2. **Add delete methods to repositories** (if not already present):
   - `StocksCacheRepository.deleteByTicker(ticker: string): Promise<number>`
   - `NewsCacheRepository.deleteByTicker(ticker: string): Promise<number>`
   - `SentimentCacheRepository.deleteByTicker(ticker: string): Promise<number>`

3. **Add route to SAM template**:
   - Add DELETE `/cache` endpoint in template.yaml
   - Require `ticker` query parameter

4. **Add basic authentication** (optional but recommended):
   - Check for `X-API-Key` header
   - Compare to environment variable `CACHE_ADMIN_KEY`
   - Return 401 if unauthorized

**Verification Checklist:**
- [ ] Endpoint requires ticker parameter (returns 400 if missing)
- [ ] All cache tables cleared for specified ticker
- [ ] Response includes count of items deleted
- [ ] Basic authentication implemented (or documented as admin-only)

**Testing Instructions:**

Create integration tests:

- **Test cache invalidation**:
  - Cache data for AAPL (stocks, news, sentiment)
  - Call `DELETE /cache?ticker=AAPL`
  - Verify all cached items deleted
  - Verify response shows correct itemsDeleted count

- **Test invalid ticker**:
  - Call with non-existent ticker
  - Verify returns 200 with itemsDeleted: 0

Run tests: `cd backend && npm test -- handlers/cacheInvalidate.handler`

**Commit Message Template:**
```
feat(cache): add cache invalidation endpoint for admin use

- Create DELETE /cache endpoint to invalidate ticker cache
- Delete all cached items across StocksCache, NewsCache, SentimentCache
- Add delete methods to all cache repositories
- Implement basic authentication via X-API-Key header
- Add integration tests for cache invalidation flows

Task: Phase 2, Task 2.6
```

**Estimated tokens:** ~4,000

---

### Task 2.7: Update API Documentation

**Goal:** Document new cache-aware endpoints, including cache metadata fields and expected behavior.

**Files to Modify:**
- `backend/README.md` - Update API documentation
- Add OpenAPI spec (optional): `backend/openapi.yaml`

**Prerequisites:**
- Tasks 2.1-2.2 complete (endpoints functional)

**Implementation Steps:**

1. **Update `/stocks` endpoint documentation**:
   - Document cache metadata fields (`cached`, `cacheHitRate`)
   - Explain cache TTL (7 days)
   - Provide example responses (cache hit vs miss)

2. **Update `/news` endpoint documentation**:
   - Document cache metadata (`cached`, `newArticles`)
   - Explain deduplication logic
   - Document TTL (30 days)

3. **Document cache warming** (if implemented):
   - Explain how to run cache warming script
   - List popular tickers pre-warmed

4. **Document cache invalidation** (if implemented):
   - Explain DELETE `/cache` endpoint
   - Document authentication requirements
   - Provide example curl commands

5. **Add architecture diagram** (optional):
   - Visual representation of three-tier lookup
   - Show DynamoDB → Lambda → External API flow

**Verification Checklist:**
- [ ] All endpoints documented with request/response examples
- [ ] Cache behavior clearly explained
- [ ] TTL values documented for each cache table
- [ ] Examples include both cache hit and miss scenarios

**Commit Message Template:**
```
docs(api): update documentation for cache-aware endpoints

- Document cache metadata fields in responses
- Explain three-tier lookup pattern
- Add examples for cache hit and cache miss scenarios
- Document TTL values for each cache table
- Add cache warming and invalidation instructions

Task: Phase 2, Task 2.7
```

**Estimated tokens:** ~2,500

---

### Task 2.8: Deploy and Validate Caching Layer

**Goal:** Deploy updated Lambda with caching to production and validate cache behavior with real requests.

**Files to Modify:**
- None (deployment only)

**Prerequisites:**
- All Phase 2 tasks complete
- All tests passing
- Code reviewed and committed

**Implementation Steps:**

1. **Run full test suite**:
   - Unit tests: `cd backend && npm test`
   - Integration tests: `cd backend && npm run test:integration` (if separate)
   - Ensure 100% pass rate

2. **Build and deploy**:
   - Run `sam build` in `backend/`
   - Run `sam deploy` (use existing stack)
   - Confirm changeset (should show handler updates, no infrastructure changes)

3. **Validate deployment**:
   - Test `/stocks` endpoint with cache miss:
     ```bash
     curl "https://your-api.execute-api.us-east-1.amazonaws.com/stocks?ticker=RARE_TICKER&startDate=2025-01-01&endDate=2025-01-30"
     ```
   - Verify response has `cached: false`
   - Test same request again, verify `cached: true`

4. **Validate news endpoint**:
   - Test `/news` with cache miss:
     ```bash
     curl "https://your-api.execute-api.us-east-1.amazonaws.com/news?ticker=RARE_TICKER&limit=20"
     ```
   - Verify response has `cached: false`, `newArticles: 20`
   - Test again, verify `cached: true`, `newArticles: 0`

5. **Check CloudWatch metrics** (if Task 2.4 completed):
   - Open CloudWatch Console → Metrics
   - Verify `CacheHitRate`, `ApiCallCount` metrics appear
   - Check values match expected behavior

6. **Warm cache for popular stocks** (if Task 2.5 completed):
   - Run `npm run warm-cache` locally (if script connects to AWS)
   - Or manually test popular tickers (AAPL, GOOGL, MSFT)

**Verification Checklist:**
- [ ] Deployment successful without errors
- [ ] Cache miss followed by cache hit behaves correctly
- [ ] CloudWatch logs show cache operations
- [ ] DynamoDB tables contain cached data after requests
- [ ] No regression in existing functionality (prices/news still correct)
- [ ] CloudWatch metrics appear (if implemented)

**Testing Instructions:**

Run live tests against deployed endpoint:

- **Popular stock (high cache hit rate)**:
  - Request AAPL data
  - Verify fast response (<500ms for cached data)

- **Rare stock (cache miss)**:
  - Request obscure ticker
  - Verify slower response (API call overhead)
  - Second request should be faster (cached)

- **Verify cache TTL**:
  - Check DynamoDB items have `ttl` attribute
  - Verify TTL is ~7 days (stocks) or ~30 days (news) from now

**Commit Message Template:**
```
chore(deploy): deploy Lambda caching layer to production

- Successfully deployed cache-aware stocks and news endpoints
- Validated cache hit and miss behavior with live requests
- Verified DynamoDB items cached with correct TTL
- CloudWatch metrics reporting cache performance
- No regression in existing functionality

Task: Phase 2, Task 2.8
```

**Estimated tokens:** ~4,000

---

## Review Feedback (Iteration 1)

### Critical Issues - Tests Cannot Run

> **Consider:** When you run `npx tsc --noEmit` in the backend directory, what TypeScript errors do you see?
>
> **Think about:** In `src/handlers/stocks.handler.ts:13` and `src/handlers/news.handler.ts:14`, there are type imports that are never used in the code. How does TypeScript's unused variable checking affect test compilation?
>
> **Reflect:** What happens when you run `npm test -- handlers`? Does the test suite even start, or does it fail during compilation? If tests can't compile, can they pass?

### Task 2.1 & 2.2 - Missing Integration Tests

> **Consider:** The plan at lines 95-121 specifies integration tests for `stocks.handler` that should verify cache miss flow, cache hit flow, partial cache hits, and metadata caching. Looking at `backend/__tests__/handlers/stocks.handler.test.ts`, which of these test scenarios are actually implemented?
>
> **Think about:** The existing tests in `stocks.handler.test.ts` use mocks for the Tiingo service. Do any of these tests actually verify that DynamoDB caching is working? Do they test the three-tier lookup pattern?
>
> **Reflect:** How can you verify that the `handlePricesRequest` function correctly:
> - Checks DynamoDB cache first before calling the API?
> - Calculates cache hit rate correctly?
> - Returns `cached: true` when data comes from cache?
> - Returns `cached: false` when data comes from the API?
> - Caches API responses in DynamoDB for future requests?
>
> **Consider:** The plan at lines 204-229 specifies integration tests for `news.handler`. Where is the file `backend/__tests__/handlers/news.handler.test.ts`? Does it exist?

### Task 2.4 - Cache Performance Metrics

> **Consider:** The plan specifies Task 2.4 to add CloudWatch metrics. When you look in `backend/src/utils/`, do you see a `metrics.util.ts` file?
>
> **Think about:** In `src/handlers/stocks.handler.ts` and `src/handlers/news.handler.ts`, are there any calls to log CloudWatch metrics for cache hit rate? How would you know if the cache is performing well in production without metrics?
>
> **Reflect:** The success criteria at line 10 mentions "Cache hit rate >90% for popular stocks" - how can this be measured and monitored without metrics instrumentation?

### Task 2.5 - Cache Warming Strategy

> **Consider:** The plan describes Task 2.5 for cache warming. The task file says "optional" in the file description (line 391), but is it listed as "Optional" in the task title like Task 2.6?
>
> **Think about:** If popular stocks (AAPL, GOOGL, MSFT, etc.) are always cold-started on first request, will you meet the success criteria of ">90% cache hit rate"? Or would pre-warming the cache help achieve this goal?

### Code Quality

> **Consider:** Looking at the test file structure, you have tests in `backend/__tests__/handlers/stocks.handler.test.ts`. The plan at line 95 specifies tests should be in `backend/src/handlers/__tests__/stocks.handler.integration.test.ts`. Does the location matter for test organization?
>
> **Think about:** The existing tests mock the Tiingo and Finnhub services. For integration tests that verify DynamoDB caching behavior, would you still mock the external APIs, or would you mock DynamoDB instead?

## Phase Verification

After completing all tasks, verify the entire phase:

**Functional Validation:**
- [ ] `/stocks` endpoint uses DynamoDB cache before API calls
- [ ] `/news` endpoint deduplicates articles using cache
- [ ] Cache metadata included in responses
- [ ] TTL set correctly on all cached items (7 days for stocks, 30 days for news)

**Performance Validation:**
- [ ] Cached requests <500ms response time
- [ ] Uncached requests <3s response time (API call overhead)
- [ ] Cache hit rate >90% for popular stocks (AAPL, GOOGL) after initial fetch

**Testing Validation:**
- [ ] All unit tests passing: `cd backend && npm test`
- [ ] All integration tests passing
- [ ] Manual testing confirms cache behavior

**Monitoring Validation:**
- [ ] CloudWatch metrics visible (if implemented)
- [ ] CloudWatch Logs show cache operations
- [ ] DynamoDB Console shows cached items

**Known Limitations:**
- Sentiment analysis not cached yet (will implement in Phase 3)
- Frontend still uses syncOrchestrator (will update in Phase 4)
- Cache warming is manual (optional: schedule via EventBridge in future)

---

## Next Steps

✅ **Phase 2 Complete!** You now have:
- Cache-aware stocks and news endpoints
- Deduplication preventing redundant API calls
- CloudWatch metrics for monitoring (optional)
- Cache warming strategy (optional)

**Proceed to Phase 3:** Implement async sentiment processing in Lambda.

→ **[Phase 3: Async Sentiment Processing](./Phase-3.md)**
