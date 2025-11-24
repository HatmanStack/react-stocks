# Phase 2: Application Optimizations

## Phase Goal

Implement application-level performance optimizations that build on Phase 1's infrastructure improvements. These features enable efficient multi-ticker data fetching, proactive cache warming for predictable traffic, and comprehensive monitoring for ongoing optimization. Focus on user experience improvements (faster portfolio loading) and operational insights (cost tracking, performance dashboards).

**Success Criteria:**
- Batch endpoints reduce portfolio loading time by 60%
- Cache warming eliminates first-request latency for top 20 tickers
- CloudWatch dashboard provides real-time optimization metrics
- Cost analysis tools identify optimization opportunities
- Performance benchmarks validate improvements
- All features maintain backward compatibility

**Estimated tokens:** ~85,000

---

## Prerequisites

### Required Reading
- [Phase-0: Foundation](./Phase-0.md) - ADRs and shared patterns
- [Phase-1: Infrastructure Optimizations](./Phase-1.md) - Verify completion

### Previous Phases
- **Phase 1 must be 100% complete** before starting Phase 2
- Verify API Gateway caching is enabled and working
- Verify Lambda optimization deployed successfully
- Verify DynamoDB variable TTL is active

### External Dependencies
- Phase 1 stack deployed and operational
- CloudWatch Logs Insights queries from Phase 1 tested
- Frontend ready for batch API integration

### Environment Requirements
- Same as Phase 1 (Node.js v20, AWS CLI, SAM CLI)
- Optional: CloudWatch dashboard access for testing

---

## Tasks

### Task 1: Backend - Batch Stocks Endpoint

**Goal:** Create `/batch/stocks` POST endpoint that accepts multiple tickers and returns aggregated stock price data. Reduces frontend round-trips from N requests to 1 request for portfolio loading.

**Files to Modify/Create:**
- `backend/src/handlers/batch.handler.ts` - New handler for batch operations
- `backend/src/index.ts` - Add route for `/batch/stocks`
- `backend/template.yaml` - Add API Gateway route configuration
- `backend/__tests__/handlers/batch.handler.test.ts` - Comprehensive tests

**Prerequisites:**
- Understand ADR-006 request batching design
- Review existing `stocks.handler.ts` for single-ticker logic
- Phase 1 Task 2 complete (API Gateway caching configured)

**Implementation Steps:**
1. Design batch request/response format:
   ```typescript
   // Request body
   interface BatchStocksRequest {
     tickers: string[]; // Max 10 tickers
     startDate: string; // YYYY-MM-DD
     endDate?: string;  // YYYY-MM-DD (optional)
   }

   // Response body
   interface BatchStocksResponse {
     data: Record<string, TiingoStockPrice[]>; // { AAPL: [...], GOOGL: [...] }
     errors: Record<string, string>;            // { TSLA: 'Ticker not found' }
     _meta: {
       successCount: number;
       errorCount: number;
       cached: Record<string, boolean>; // { AAPL: true, GOOGL: false }
       timestamp: string;
     };
   }
   ```

2. Create `batch.handler.ts` with request validation:
   - Validate `tickers` is array with 1-10 elements (prevent timeout)
   - Validate each ticker format (alphanumeric, dots, hyphens)
   - Validate `startDate` and `endDate` format (YYYY-MM-DD)
   - Return 400 error for invalid input with specific error message

3. Implement parallel ticker processing:
   - Use `Promise.allSettled` to process all tickers concurrently
   - Don't fail entire batch if one ticker fails
   - **First, export** the internal `handlePricesRequest` function from `stocks.handler.ts` (currently not exported)
   - Import and call `handlePricesRequest` for each ticker (DRY - reuses existing cache logic)
   - Alternative: Call `handleStocksRequest` but requires constructing API Gateway event objects (less ideal)
   - Capture individual ticker results (success or error)

4. Build response with partial results:
   - Successful tickers → `data` object
   - Failed tickers → `errors` object with error message
   - Metadata: success/error counts, per-ticker cache status
   - Example:
     ```typescript
     const results = await Promise.allSettled(
       tickers.map(ticker => handlePricesRequest(ticker, startDate, endDate, apiKey))
     );

     const response: BatchStocksResponse = {
       data: {},
       errors: {},
       _meta: { successCount: 0, errorCount: 0, cached: {}, timestamp: new Date().toISOString() }
     };

     results.forEach((result, idx) => {
       const ticker = tickers[idx];
       if (result.status === 'fulfilled') {
         response.data[ticker] = result.value.data;
         response._meta.cached[ticker] = result.value.cached;
         response._meta.successCount++;
       } else {
         response.errors[ticker] = result.reason.message;
         response._meta.errorCount++;
       }
     });
     ```

5. Add rate limiting for batch size:
   - Reject requests with >10 tickers (400 error: "Maximum 10 tickers per batch")
   - Document batch size limit in API response headers: `X-Batch-Limit: 10`
   - Consider future enhancement: pagination for larger batches

6. Update `index.ts` to route batch requests:
   - Add case for `/batch/stocks` path
   - Verify method is POST
   - Import and call `handleBatchStocksRequest`

7. Update `template.yaml` API Gateway configuration:
   - Add route: `POST /batch/stocks`
   - **Disable caching** for POST endpoints (caching only works for GET)
   - Configure throttling: `ThrottlingBurstLimit: 50, ThrottlingRateLimit: 20`
   - Lower limits than single-ticker endpoint (batch is more expensive)

**Verification Checklist:**
- [ ] Request validation rejects invalid tickers, dates, batch sizes
- [ ] Parallel processing completes for all tickers
- [ ] Partial results returned when some tickers fail
- [ ] Response includes success/error counts and cache status
- [ ] API Gateway route configured correctly (POST, no caching)
- [ ] Rate limiting prevents >10 ticker batches
- [ ] `handlePricesRequest` function exported from `stocks.handler.ts`
- [ ] Handler imports and reuses `handlePricesRequest` logic (DRY)

**Testing Instructions:**
- **Unit tests** (`__tests__/handlers/batch.handler.test.ts`):
  ```typescript
  describe('handleBatchStocksRequest', () => {
    test('returns data for valid tickers', async () => {
      const event = mockAPIGatewayEvent({
        rawPath: '/batch/stocks',
        method: 'POST',
        body: JSON.stringify({
          tickers: ['AAPL', 'GOOGL'],
          startDate: '2025-01-01'
        })
      });

      const response = await handleBatchStocksRequest(event);
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.AAPL).toBeDefined();
      expect(body.data.GOOGL).toBeDefined();
      expect(body._meta.successCount).toBe(2);
    });

    test('returns partial results when one ticker fails', async () => {
      // Mock handlePricesRequest to fail for INVALID ticker
      const response = await handleBatchStocksRequest(event);
      const body = JSON.parse(response.body);
      expect(body.data.AAPL).toBeDefined();
      expect(body.errors.INVALID).toContain('not found');
      expect(body._meta.successCount).toBe(1);
      expect(body._meta.errorCount).toBe(1);
    });

    test('rejects batch with >10 tickers', async () => {
      const event = mockAPIGatewayEvent({
        body: JSON.stringify({
          tickers: Array(11).fill('AAPL'), // 11 tickers
          startDate: '2025-01-01'
        })
      });

      const response = await handleBatchStocksRequest(event);
      expect(response.statusCode).toBe(400);
      expect(response.body).toContain('Maximum 10 tickers');
    });
  });
  ```
- **Integration tests** (`__tests__/integration/batch-api.test.ts`):
  - Mock DynamoDB and Tiingo API
  - Test full Lambda handler with mocked AWS SDK
  - Verify parallel processing doesn't cause race conditions
  - Verify timeout handling (batch completes within Lambda timeout)
- **CI compatibility:** All tests use mocked AWS SDK and axios

**Commit Message Template:**
```text
Author & Commiter: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com

feat(api): add batch stocks endpoint for multi-ticker requests

Create POST /batch/stocks endpoint accepting up to 10 tickers
Implement parallel processing with Promise.allSettled
Return partial results when some tickers fail
Include per-ticker cache status in response metadata
Add rate limiting (max 10 tickers per batch)
Configure API Gateway route with POST method and throttling
```

---

### Task 2: Backend - Batch News and Sentiment Endpoints

**Goal:** Create `/batch/news` and `/batch/sentiment` endpoints following the same pattern as batch stocks. Completes the batch API suite for portfolio loading optimization.

**Files to Modify/Create:**
- `backend/src/handlers/batch.handler.ts` - Add news and sentiment batch handlers
- `backend/src/index.ts` - Add routes for `/batch/news` and `/batch/sentiment`
- `backend/template.yaml` - Add API Gateway route configurations
- `backend/__tests__/handlers/batch.handler.test.ts` - Add tests for new endpoints

**Prerequisites:**
- Task 1 complete (batch stocks endpoint working)
- Review `news.handler.ts` and `sentiment.handler.ts` for single-ticker logic

**Implementation Steps:**
1. Create `handleBatchNewsRequest` function:
   - Request format: `{ tickers: string[], limit?: number }`
   - Default limit: 10 articles per ticker
   - Max limit: 50 articles per ticker (prevent large payloads)
   - Response format: `{ data: { AAPL: [...articles], GOOGL: [...] }, errors: {...} }`
   - **Export internal helper function** from `news.handler.ts` (e.g., `handleNewsWithCache`) or call `handleNewsRequest` with constructed API Gateway events
   - Reuse existing handler logic per ticker (DRY)

2. Create `handleBatchSentimentRequest` function:
   - Request format: `{ tickers: string[], startDate: string, endDate?: string }`
   - This is **GET sentiment results**, not POST sentiment job creation
   - Response format: `{ data: { AAPL: [...sentiment], GOOGL: [...] }, errors: {...} }`
   - **Export internal helper function** from `sentiment.handler.ts` or call `handleSentimentResultsRequest` with constructed API Gateway events
   - Reuse existing handler logic per ticker (DRY)

3. Add validation for batch-specific limits:
   - News: Max 10 tickers × 50 articles = 500 articles per batch
   - Sentiment: Max 10 tickers × 30 days = 300 sentiment records per batch
   - Reject oversized batches with 400 error

4. Update `index.ts` routing:
   - Add case for `/batch/news` (POST)
   - Add case for `/batch/sentiment` (POST)
   - Verify method is POST for both

5. Update `template.yaml` API Gateway configuration:
   - Add route: `POST /batch/news`
   - Add route: `POST /batch/sentiment`
   - Disable caching for POST endpoints
   - Configure throttling (same as batch stocks)

6. Consider batch sentiment job creation:
   - **Deferred to future enhancement:** Batch POST /sentiment for multiple tickers
   - Current implementation: Frontend must call POST /sentiment per ticker
   - Reason: Async job tracking is more complex for batches

**Verification Checklist:**
- [ ] Batch news endpoint returns articles for all tickers
- [ ] Batch sentiment endpoint returns sentiment data for all tickers
- [ ] Partial results work for both endpoints
- [ ] Validation rejects oversized batches (article/record limits)
- [ ] API Gateway routes configured correctly
- [ ] Handlers reuse existing single-ticker logic (DRY)

**Testing Instructions:**
- **Unit tests** (`__tests__/handlers/batch.handler.test.ts`):
  - Test `handleBatchNewsRequest` with valid tickers
  - Test `handleBatchSentimentRequest` with valid date range
  - Test partial results when one ticker fails
  - Test validation (batch size, article limits)
- **Integration tests** (`__tests__/integration/batch-api.test.ts`):
  - Test full batch flow for news endpoint
  - Test full batch flow for sentiment endpoint
  - Mock DynamoDB, Finnhub, sentiment cache
- **CI compatibility:** All tests use mocked AWS SDK and axios

**Commit Message Template:**
```text
Author & Commiter: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com

feat(api): add batch news and sentiment endpoints

Create POST /batch/news endpoint (max 10 tickers, 50 articles each)
Create POST /batch/sentiment endpoint (max 10 tickers, 30 days)
Implement parallel processing with partial result support
Add validation for oversized batches
Configure API Gateway routes with POST method and throttling
Reuse existing single-ticker handler logic
```

---

### Task 3: Frontend - Batch API Client Integration

**Goal:** Update frontend to use batch endpoints when loading portfolio data. Reduces API calls from 30+ (10 stocks × 3 endpoints) to 3 (1 batch call per endpoint type).

**Files to Modify/Create:**
- `src/services/api/batch.service.ts` - New batch API client
- `src/hooks/usePortfolioBatchData.ts` - Hook for batch portfolio loading
- `src/contexts/PortfolioContext.tsx` - Integrate batch loading
- `__tests__/services/api/batch.service.test.ts` - Client tests

**Prerequisites:**
- Task 1 and 2 complete (batch endpoints deployed)
- Understand existing API service patterns (`tiingo.service.ts`, `finnhub.service.ts`)
- Review React Query usage in existing hooks

**Implementation Steps:**
1. Create `batch.service.ts` with typed interfaces:
   ```typescript
   import axios from 'axios';
   import { Environment } from '@/config/environment';

   interface BatchStocksRequest {
     tickers: string[];
     startDate: string;
     endDate?: string;
   }

   interface BatchStocksResponse {
     data: Record<string, TiingoStockPrice[]>;
     errors: Record<string, string>;
     _meta: {
       successCount: number;
       errorCount: number;
       cached: Record<string, boolean>;
       timestamp: string;
     };
   }

   export async function fetchBatchStocks(
     request: BatchStocksRequest
   ): Promise<BatchStocksResponse> {
     const response = await axios.post<BatchStocksResponse>(
       `${Environment.BACKEND_URL}/batch/stocks`,
       request,
       { timeout: 60000 } // 60s for batch (longer than single ticker)
     );
     return response.data;
   }

   // Similar functions for fetchBatchNews, fetchBatchSentiment
   ```

2. Create `usePortfolioBatchData` hook:
   - Accept portfolio tickers array as input
   - Chunk tickers into batches of 10 (API limit)
   - Make parallel batch requests for stocks, news, sentiment
   - Aggregate results across multiple batches if portfolio >10 tickers
   - Return combined data with loading states
   - Example:
     ```typescript
     export function usePortfolioBatchData(tickers: string[]) {
       const { data, isLoading, error } = useQuery({
         queryKey: ['portfolioBatch', tickers],
         queryFn: async () => {
           const batches = chunk(tickers, 10); // Lodash or custom chunk

           const results = await Promise.all(
             batches.map(batch => Promise.all([
               fetchBatchStocks({ tickers: batch, startDate: thirtyDaysAgo() }),
               fetchBatchNews({ tickers: batch, limit: 10 }),
               fetchBatchSentiment({ tickers: batch, startDate: thirtyDaysAgo() })
             ]))
           );

           // Aggregate results from multiple batches
           return aggregateResults(results);
         },
         staleTime: 1000 * 60 * 5, // 5 minutes
       });

       return { data, isLoading, error };
     }
     ```

3. Update `PortfolioContext` to support batch loading:
   - Add `useBatchLoading` boolean state
   - When portfolio >3 tickers, use batch loading
   - When portfolio ≤3 tickers, use existing single-ticker loading (less overhead)
   - Provide context value: `{ portfolio, batchData, isLoadingBatch }`

4. Update portfolio screen to use batch data:
   - Check if `batchData` is available (portfolio >3 tickers)
   - If yes, render from `batchData`
   - If no, use existing single-ticker hooks
   - Maintain backward compatibility (no breaking changes)

5. Handle batch errors gracefully:
   - Display partial results when some tickers fail
   - Show error message per failed ticker: "Could not load data for INVALID"
   - Don't block entire portfolio rendering on partial failures

6. Add loading indicators:
   - Show spinner while batch loading in progress
   - Display per-ticker loading state if needed
   - Optimize for perceived performance (show cached data immediately, update when fresh data arrives)

**Verification Checklist:**
- [ ] Batch service correctly calls backend batch endpoints
- [ ] Hook chunks portfolio into batches of 10
- [ ] Hook aggregates results from multiple batches
- [ ] PortfolioContext integrates batch loading seamlessly
- [ ] Portfolio screen uses batch data when available
- [ ] Partial results render correctly (some tickers fail)
- [ ] Loading indicators show during batch fetch
- [ ] Backward compatibility maintained (≤3 tickers use single-ticker API)

**Testing Instructions:**
- **Unit tests** (`__tests__/services/api/batch.service.test.ts`):
  - Test `fetchBatchStocks` with mocked axios
  - Test error handling (network failure, 400 response, partial results)
  - Test request format (correct body structure)
- **Unit tests** (`__tests__/hooks/usePortfolioBatchData.test.ts`):
  - Test batching logic (10 tickers = 1 batch, 15 tickers = 2 batches)
  - Test result aggregation
  - Test error handling (one batch fails)
  - Mock React Query
- **Integration tests** (`__tests__/integration/portfolio-batch.test.ts`):
  - Render portfolio with 5 tickers
  - Verify batch API called once (not 15 times)
  - Verify data displays correctly
  - Mock backend batch endpoints
- **CI compatibility:** All tests mock axios and React Query

**Commit Message Template:**
```text
Author & Commiter: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com

feat(frontend): integrate batch API for portfolio loading

Create batch API service client (stocks, news, sentiment)
Implement usePortfolioBatchData hook with chunking logic
Update PortfolioContext to support batch loading
Render portfolio from batch data when >3 tickers
Handle partial results and display per-ticker errors
Maintain backward compatibility for small portfolios
Reduce API calls from 30+ to 3 for 10-ticker portfolio
```

---

### Task 4: Cache Warming System - Lambda Function

**Goal:** Create EventBridge-triggered Lambda function that pre-warms DynamoDB cache for popular tickers before market open. Eliminates first-request latency for 80% of users.

**Files to Modify/Create:**
- `backend/src/handlers/cacheWarming.handler.ts` - New warming handler
- `backend/src/services/cacheWarming.service.ts` - Warming logic
- `backend/template.yaml` - Add warming function and EventBridge rule
- `backend/__tests__/handlers/cacheWarming.handler.test.ts` - Tests

**Prerequisites:**
- Understand ADR-007 cache warming strategy
- Phase 1 complete (DynamoDB caching operational)
- CloudWatch Logs Insights queries working (to identify top tickers)

**Implementation Steps:**
1. Create CloudWatch Logs Insights query to identify top tickers:
   ```
   fields @timestamp, @message
   | filter @message like /\[StocksHandler\] Fetching prices for/
   | parse @message /Fetching prices for (?<ticker>[A-Z]+)/
   | stats count() as RequestCount by ticker
   | sort RequestCount desc
   | limit 20
   ```
   - Run this query weekly to update top ticker list
   - Store results in DynamoDB table: `TopTickersCache`

2. Create `TopTickersCache` DynamoDB table in SAM template:
   - Partition key: `listType` (String, value: 'top20')
   - Attributes: `tickers` (List of strings), `updatedAt` (Number)
   - Purpose: Store top 20 tickers from CloudWatch analysis
   - TTL: 7 days (weekly refresh)

3. Create `cacheWarming.service.ts`:
   - Function: `getTopTickers()` - Fetch from `TopTickersCache` table
   - Function: `warmCache(ticker: string)` - Fetch and cache data for one ticker
   - Steps for `warmCache`:
     1. Fetch stock prices (last 30 days)
     2. Fetch news (last 10 articles)
     3. Fetch company metadata
     4. Store all in DynamoDB cache (reuse existing repositories)
     5. Log warming result: "Warmed cache for AAPL: 30 prices, 10 news, 1 metadata"
   - Function: `warmAllTopTickers()` - Warm cache for all top tickers in parallel

4. Create `cacheWarming.handler.ts`:
   - Triggered by EventBridge rule (no API Gateway event)
   - Event format: `{ source: 'aws.events', detail-type: 'Scheduled Event' }`
   - Handler logic:
     ```typescript
     export async function handler(event: ScheduledEvent) {
       console.log('[CacheWarming] Starting cache warming for top tickers');

       const topTickers = await getTopTickers();
       console.log(`[CacheWarming] Warming cache for ${topTickers.length} tickers`);

       const results = await Promise.allSettled(
         topTickers.map(ticker => warmCache(ticker))
       );

       const successCount = results.filter(r => r.status === 'fulfilled').length;
       const errorCount = results.filter(r => r.status === 'rejected').length;

       console.log(`[CacheWarming] Completed: ${successCount} success, ${errorCount} errors`);

       return { statusCode: 200, body: JSON.stringify({ successCount, errorCount }) };
     }
     ```

5. Update `template.yaml` to add warming function and EventBridge rule:
   - Create `CacheWarmingFunction` resource:
     - Runtime: nodejs20.x
     - Memory: 512MB (I/O bound)
     - Timeout: 300s (5 minutes for 20 tickers)
     - Environment: Same as `ReactStocksFunction` (Tiingo/Finnhub keys, DynamoDB table names)
     - Policies: Same DynamoDB permissions as main function
   - Create `CacheWarmingSchedule` EventBridge rule:
     - Schedule: `cron(0 14 ? * MON-FRI *)` (9:00 AM ET = 14:00 UTC, weekdays only)
     - Target: `CacheWarmingFunction`
     - Description: "Warm cache for top tickers 30 minutes before market open"

6. Add manual warming API endpoint (optional):
   - Add `GET /admin/warm-cache` endpoint
   - Protected by API key or IAM auth
   - Triggers same warming logic as scheduled function
   - Useful for testing and manual refreshes

**Verification Checklist:**
- [ ] CloudWatch Logs Insights query returns top 20 tickers
- [ ] `TopTickersCache` table stores ticker list correctly
- [ ] `warmCache` function fetches and caches all data types
- [ ] EventBridge rule triggers warming function daily at 9:00 AM ET
- [ ] Warming completes within 5 minutes for 20 tickers
- [ ] Parallel warming doesn't cause rate limit errors (Tiingo/Finnhub)
- [ ] CloudWatch Logs show warming progress and results

**Testing Instructions:**
- **Unit tests** (`__tests__/handlers/cacheWarming.handler.test.ts`):
  - Test `getTopTickers` with mocked DynamoDB
  - Test `warmCache` with mocked API clients and repositories
  - Test `warmAllTopTickers` parallel processing
  - Test handler with mocked EventBridge event
- **Integration tests** (`__tests__/integration/cache-warming.test.ts`):
  - Mock DynamoDB, Tiingo, Finnhub APIs
  - Test full warming flow for 5 tickers
  - Verify cache populated after warming
  - Test error handling (API failure for one ticker)
- **Manual verification** (local, expensive):
  - Deploy warming function
  - Manually trigger via AWS Console or CLI: `aws lambda invoke --function-name CacheWarmingFunction output.json`
  - Check CloudWatch Logs for warming progress
  - Query DynamoDB tables to verify cache populated
  - Test frontend: First request for warmed ticker should be fast
- **CI compatibility:** Tests mock all AWS SDK and external APIs

**Commit Message Template:**
```text
Author & Commiter: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com

feat(cache): add cache warming system for popular tickers

Create TopTickersCache DynamoDB table for top 20 tickers
Implement cache warming service (stocks, news, metadata)
Create EventBridge-triggered Lambda function for warming
Schedule warming daily at 9:00 AM ET (weekdays only)
Warm cache for top 20 tickers in parallel (completes in 5 min)
Add CloudWatch Logs for warming progress and results
Eliminate first-request latency for 80% of users
```

---

### Task 5: CloudWatch Dashboard for Optimization Metrics

**Goal:** Create CloudWatch dashboard displaying key optimization metrics (cache hit rates, Lambda performance, cost savings). Provides at-a-glance visibility into optimization impact.

**Files to Modify/Create:**
- `backend/scripts/create-dashboard.sh` - Script to create/update dashboard
- `backend/cloudwatch-dashboard.json` - Dashboard definition
- `backend/docs/monitoring.md` - Update with dashboard documentation

**Prerequisites:**
- Phase 1 Task 8 complete (metrics logging implemented)
- CloudWatch Logs Insights queries from Phase 1 working
- Understand CloudWatch dashboard JSON format (AWS docs)

**Implementation Steps:**
1. Design dashboard layout (4 rows × 3 columns):
   - **Row 1: Cache Performance**
     - Widget 1: API Gateway cache hit rate (line chart)
     - Widget 2: DynamoDB cache hit rate (line chart)
     - Widget 3: Total cache hits vs misses (bar chart)
   - **Row 2: Lambda Performance**
     - Widget 1: Lambda invocation count (line chart)
     - Widget 2: Average duration per endpoint (line chart)
     - Widget 3: Cold start percentage (line chart)
   - **Row 3: Cost Metrics**
     - Widget 1: Lambda invocations (30-day comparison)
     - Widget 2: DynamoDB read units (30-day comparison)
     - Widget 3: Estimated cost savings (number widget)
   - **Row 4: Error Tracking**
     - Widget 1: Error rate by endpoint (line chart)
     - Widget 2: Recent errors (log widget)
     - Widget 3: API Gateway 4xx/5xx errors (line chart)

2. Create `cloudwatch-dashboard.json` with widget definitions:
   - Use CloudWatch Metrics for quantitative data (invocation count, duration)
   - Use CloudWatch Logs Insights for custom metrics (cache hit rate, cold starts)
   - Example widget for API Gateway cache hit rate:
     ```json
     {
       "type": "log",
       "properties": {
         "query": "SOURCE '/aws/lambda/react-stocks-backend-ReactStocksFunction'\n| filter @type = 'REPORT'\n| stats sum(ApiGatewayCacheHit) / (sum(ApiGatewayCacheHit) + sum(ApiGatewayCacheMiss)) * 100 as CacheHitRate by bin(5m)",
         "region": "us-east-1",
         "title": "API Gateway Cache Hit Rate (%)",
         "yAxis": { "left": { "min": 0, "max": 100 } }
       }
     }
     ```

3. Create `create-dashboard.sh` script:
   - Read stack name from `.deploy-config.json`
   - Fetch CloudFormation outputs (function name, log group names)
   - Replace placeholders in `cloudwatch-dashboard.json` with actual resource names
   - Use AWS CLI to create/update dashboard:
     ```bash
     aws cloudwatch put-dashboard \
       --dashboard-name "ReactStocksOptimization" \
       --dashboard-body file://cloudwatch-dashboard.json
     ```
   - Output dashboard URL for easy access

4. Add cost estimation widget:
   - Calculate Lambda cost: `(invocations × average-duration-ms × memory-GB) × $0.0000166667 / 1000`
   - Calculate DynamoDB cost: `(read-units × $0.25 / 1M) + (write-units × $1.25 / 1M)`
   - Calculate API Gateway cost: `(requests × $1.00 / 1M) + (cache-hours × cache-size-GB × $0.02)`
   - Display 30-day trend and percentage change
   - Example: "Estimated savings: $45.20/month (-32%)"

5. Add alerting integration:
   - Widget annotations for alarm thresholds
   - Link to CloudWatch Alarms for critical metrics
   - Visual indicators when alarms are triggered (red lines)

6. Document dashboard usage in `monitoring.md`:
   - How to access dashboard (AWS Console URL)
   - Interpretation guide for each widget
   - Expected values for optimized system
   - Troubleshooting steps when metrics are off-target

**Verification Checklist:**
- [ ] Dashboard JSON is valid (test with AWS CLI)
- [ ] All widgets display data correctly
- [ ] Cache hit rate widgets show >70% for optimized endpoints
- [ ] Lambda performance widgets show reduced invocations
- [ ] Cost estimation widgets calculate correctly
- [ ] Error tracking widgets help identify issues
- [ ] Dashboard updates when script runs (idempotent)

**Testing Instructions:**
- **Unit tests:** Not applicable (CloudWatch dashboard configuration)
- **Manual verification** (post-deployment):
  - Run `./scripts/create-dashboard.sh`
  - Open CloudWatch Console → Dashboards → "ReactStocksOptimization"
  - Verify all widgets display data (may take 5-10 minutes for metrics to populate)
  - Verify cache hit rate >70% after API Gateway caching enabled
  - Verify Lambda invocations decreased after optimization
  - Verify cost savings calculation matches expected values
- **CI compatibility:** Not applicable (requires live AWS resources)

**Commit Message Template:**
```text
Author & Commiter: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com

feat(monitoring): create CloudWatch dashboard for optimization metrics

Design 4-row dashboard layout (cache, performance, cost, errors)
Implement API Gateway cache hit rate widget
Implement DynamoDB cache hit rate widget
Implement Lambda performance metrics (invocations, duration, cold starts)
Add cost estimation widgets with 30-day comparison
Create script to generate dashboard from CloudFormation outputs
Document dashboard usage and interpretation in monitoring.md
```

---

### Task 6: Performance Benchmarking Suite

**Goal:** Create automated benchmarking tool to measure optimization impact (latency, throughput, cost). Validates improvements and identifies regression.

**Files to Modify/Create:**
- `backend/scripts/benchmark.ts` - Benchmarking script
- `backend/docs/benchmark-results.md` - Results documentation
- `backend/__tests__/benchmark.test.ts` - Benchmark validation tests

**Prerequisites:**
- Phase 1 and Phase 2 Tasks 1-5 complete
- Deployed stack with optimizations enabled
- Understanding of performance testing methodology

**Implementation Steps:**
1. Design benchmark scenarios:
   - **Scenario 1: Single ticker fetch (cold)**
     - Measure: First request for ticker after cache expiration
     - Metrics: Response time, Lambda duration, cache miss
   - **Scenario 2: Single ticker fetch (warm)**
     - Measure: Second identical request (API Gateway cache hit)
     - Metrics: Response time, Lambda not invoked, cache hit
   - **Scenario 3: Batch ticker fetch (10 tickers)**
     - Measure: Batch API vs sequential single-ticker API
     - Metrics: Total response time, Lambda invocations, throughput
   - **Scenario 4: Portfolio load (5 tickers)**
     - Measure: Full portfolio data fetch (stocks + news + sentiment)
     - Metrics: Total load time, cache hit rate, user-perceived latency
   - **Scenario 5: Cold start frequency**
     - Measure: Percentage of requests experiencing cold starts
     - Metrics: Cold start percentage, cold start duration

2. Create `benchmark.ts` script:
   - Use `tsx` to run TypeScript directly
   - Accept CLI arguments: `--scenario <name>`, `--iterations <count>`, `--output <file>`
   - Example:
     ```typescript
     async function runBenchmark(scenario: string, iterations: number) {
       const results: BenchmarkResult[] = [];

       for (let i = 0; i < iterations; i++) {
         const startTime = Date.now();

         if (scenario === 'single-ticker-cold') {
           await axios.get(`${API_URL}/stocks?ticker=AAPL&startDate=${date}`);
         } else if (scenario === 'single-ticker-warm') {
           // Make request twice, measure second request
           await axios.get(`${API_URL}/stocks?ticker=AAPL&startDate=${date}`);
           await axios.get(`${API_URL}/stocks?ticker=AAPL&startDate=${date}`);
         } else if (scenario === 'batch') {
           await axios.post(`${API_URL}/batch/stocks`, {
             tickers: ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN'],
             startDate: date
           });
         }

         const duration = Date.now() - startTime;
         results.push({ iteration: i, duration });
       }

       return calculateStats(results); // min, max, mean, median, p95, p99
     }
     ```

3. Implement statistical analysis:
   - Calculate: min, max, mean, median, p95, p99 latency
   - Calculate: standard deviation, coefficient of variation
   - Compare: before/after optimization (load previous results from file)
   - Generate: markdown table with results
   - Example output:
     ```
     | Scenario              | Mean (ms) | p95 (ms) | p99 (ms) | Cache Hit Rate |
     |-----------------------|-----------|----------|----------|----------------|
     | Single ticker (cold)  | 450       | 650      | 800      | 0%             |
     | Single ticker (warm)  | 120       | 150      | 180      | 100%           |
     | Batch (10 tickers)    | 2100      | 2400     | 2600     | 60%            |
     | Portfolio (5 tickers) | 850       | 1100     | 1300     | 75%            |
     ```

4. Add cost estimation per scenario:
   - Track Lambda invocations per benchmark run
   - Calculate cost: `invocations × duration × memory × pricing-rate`
   - Compare: batch vs sequential API cost
   - Example: "Batch API saves $0.02 per portfolio load (10 tickers)"

5. Create `benchmark-results.md` template:
   - Document baseline results (before optimization)
   - Document optimized results (after Phase 1 and Phase 2)
   - Calculate improvement percentage: `(baseline - optimized) / baseline × 100`
   - Add interpretation and recommendations

6. Integrate with CI (optional):
   - Add GitHub Actions workflow to run benchmarks on PR
   - Compare PR benchmarks to main branch baseline
   - Fail CI if performance regresses >10%
   - **Note:** Requires deployed stack, so run only on demand (manual trigger)

**Verification Checklist:**
- [ ] Benchmark script runs all scenarios successfully
- [ ] Statistical analysis calculates correct percentiles
- [ ] Results saved to markdown file
- [ ] Cost estimation matches CloudWatch metrics
- [ ] Comparison shows expected improvements (30-60% latency reduction)
- [ ] Batch API faster than sequential API for >3 tickers
- [ ] API Gateway cache reduces warm request latency by >70%

**Testing Instructions:**
- **Unit tests** (`__tests__/benchmark.test.ts`):
  - Test statistical calculation functions (mean, median, p95, p99)
  - Test cost estimation logic
  - Test markdown result generation
  - Mock axios for benchmark scenarios
- **Manual verification** (post-deployment, requires live stack):
  - Run `tsx backend/scripts/benchmark.ts --scenario single-ticker-cold --iterations 50`
  - Verify results saved to `benchmark-results.md`
  - Run all scenarios and compare results
  - Validate improvements match expected values (API Gateway cache hit = faster)
- **CI compatibility:** Benchmark tests mock axios, but actual benchmarking requires live stack (manual run)

**Commit Message Template:**
```text
Author & Commiter: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com

feat(benchmark): add performance benchmarking suite

Create benchmark script with 5 scenarios (cold, warm, batch, portfolio, cold-start)
Implement statistical analysis (min, max, mean, median, p95, p99)
Add cost estimation per scenario
Generate markdown results table with before/after comparison
Document baseline and optimized results in benchmark-results.md
Validate 30-60% latency reduction after optimizations
```

---

### Task 7: Cost Analysis and Alerting

**Goal:** Create automated cost analysis tools and CloudWatch alarms to monitor optimization impact and prevent cost regressions.

**Files to Modify/Create:**
- `backend/scripts/analyze-costs.ts` - Cost analysis script
- `backend/template.yaml` - Add CloudWatch alarms for cost thresholds
- `backend/docs/cost-optimization.md` - Cost analysis documentation

**Prerequisites:**
- Phase 1 complete (optimizations deployed)
- CloudWatch metrics and logs available
- Understanding of AWS pricing (Lambda, DynamoDB, API Gateway)

**Implementation Steps:**
1. Create `analyze-costs.ts` script:
   - Query CloudWatch metrics for resource usage:
     - Lambda: invocations, duration-ms, memory-MB
     - DynamoDB: read-units, write-units
     - API Gateway: requests, cache-hits, cache-misses
   - Calculate costs using AWS pricing:
     ```typescript
     interface CostBreakdown {
       lambda: {
         invocations: number;
         gbSeconds: number;
         cost: number;
       };
       dynamodb: {
         readUnits: number;
         writeUnits: number;
         cost: number;
       };
       apiGateway: {
         requests: number;
         cacheHours: number;
         cost: number;
       };
       total: number;
     }

     function calculateLambdaCost(invocations: number, avgDurationMs: number, memoryMB: number): number {
       const gbSeconds = (invocations * avgDurationMs / 1000) * (memoryMB / 1024);
       return gbSeconds * 0.0000166667; // Lambda pricing: $0.0000166667 per GB-second
     }
     ```

2. Compare costs before/after optimization:
   - Query metrics for 30 days before optimization deployment
   - Query metrics for 30 days after optimization deployment
   - Calculate savings: `baseline - optimized`
   - Calculate savings percentage: `(baseline - optimized) / baseline × 100`
   - Display breakdown by service (Lambda, DynamoDB, API Gateway)

3. Add CloudWatch alarms for cost anomalies:
   - Alarm: Lambda invocations >10,000/day (expected: <7,000 with cache)
   - Alarm: DynamoDB read units >50,000/day (expected: <40,000 with longer TTL)
   - Alarm: API Gateway cache hit rate <50% (expected: >70%)
   - Alarm: Lambda cold start percentage >10% (expected: <5% with provisioned concurrency)
   - SNS topic for alarm notifications (email or Slack integration)

4. Update `template.yaml` with alarm resources:
   - Create `LambdaInvocationsAlarm` CloudWatch alarm
   - Create `DynamoDBReadUnitsAlarm` CloudWatch alarm
   - Create `ApiGatewayCacheHitRateAlarm` CloudWatch alarm
   - Create `LambdaColdStartAlarm` CloudWatch alarm
   - Create `CostAnomalySNSTopic` SNS topic for notifications
   - Link alarms to SNS topic

5. Create cost optimization recommendations:
   - Analyze usage patterns: "Search endpoint averages 50ms, consider reducing memory to 256MB"
   - Identify cache inefficiencies: "News endpoint cache hit rate only 40%, consider longer TTL"
   - Suggest provisioned concurrency: "Cold starts account for 15% of requests during 9-10 AM, enable provisioning"
   - Generate actionable recommendations in script output

6. Document cost optimization in `cost-optimization.md`:
   - Baseline costs before optimization
   - Optimized costs after Phase 1 and Phase 2
   - Breakdown by service and percentage savings
   - Cost projections for traffic growth (1.5x, 2x, 5x)
   - Recommendations for further optimization

**Verification Checklist:**
- [ ] Cost analysis script calculates accurate costs
- [ ] Comparison shows expected savings (25-35% total)
- [ ] CloudWatch alarms created and linked to SNS topic
- [ ] Alarm thresholds match expected optimized values
- [ ] Recommendations are actionable and specific
- [ ] Documentation includes cost projections for growth

**Testing Instructions:**
- **Unit tests** (`__tests__/scripts/analyze-costs.test.ts`):
  - Test cost calculation functions (Lambda, DynamoDB, API Gateway)
  - Test savings percentage calculation
  - Test recommendation generation logic
  - Mock CloudWatch SDK
- **Manual verification** (post-deployment):
  - Run `tsx backend/scripts/analyze-costs.ts --days 30`
  - Verify cost calculations match AWS billing dashboard
  - Trigger CloudWatch alarm (manually invoke Lambda excessively)
  - Verify SNS notification received
  - Review recommendations for accuracy
- **CI compatibility:** Tests mock CloudWatch SDK, no live AWS resources needed

**Commit Message Template:**
```text
Author & Commiter: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com

feat(cost): add cost analysis and alerting system

Create cost analysis script with AWS pricing calculations
Compare costs before/after optimization (30-day periods)
Add CloudWatch alarms for cost anomalies (invocations, read units, cache hit rate)
Create SNS topic for alarm notifications
Generate actionable cost optimization recommendations
Document baseline and optimized costs with savings breakdown
Project costs for traffic growth scenarios
```

---

## Phase Verification

### Comprehensive Verification Checklist

Before marking Phase 2 complete, ensure all tasks are done:

**Task 1-2: Batch Endpoints**
- [ ] Batch stocks, news, sentiment endpoints deployed
- [ ] Parallel processing works for all endpoints
- [ ] Partial results returned when some tickers fail
- [ ] Rate limiting prevents >10 ticker batches
- [ ] API Gateway routes configured (POST, throttling)

**Task 3: Frontend Batch Integration**
- [ ] Batch API client implemented
- [ ] usePortfolioBatchData hook works correctly
- [ ] PortfolioContext integrates batch loading
- [ ] Portfolio screen uses batch data for >3 tickers
- [ ] Backward compatibility maintained for small portfolios

**Task 4: Cache Warming**
- [ ] Cache warming Lambda function deployed
- [ ] EventBridge rule triggers daily at 9:00 AM ET
- [ ] Top 20 tickers cached before market open
- [ ] Warming completes within 5 minutes
- [ ] CloudWatch Logs show warming progress

**Task 5: CloudWatch Dashboard**
- [ ] Dashboard created with all widgets
- [ ] Widgets display data correctly
- [ ] Cache hit rate >70% visible
- [ ] Cost savings calculated
- [ ] Dashboard accessible via AWS Console

**Task 6: Benchmarking**
- [ ] Benchmark script runs all scenarios
- [ ] Statistical analysis correct
- [ ] Results saved to markdown
- [ ] Improvements validated (30-60% latency reduction)

**Task 7: Cost Analysis**
- [ ] Cost analysis script calculates accurate costs
- [ ] CloudWatch alarms configured
- [ ] SNS notifications working
- [ ] Cost optimization documentation complete

### Integration Testing

**End-to-End Portfolio Loading:**
1. Open frontend with 10-ticker portfolio
2. Verify batch API called (3 requests total, not 30)
3. Verify all ticker data loaded correctly
4. Verify loading time <3 seconds (vs >10 seconds before)
5. Check CloudWatch dashboard - verify metrics updated

**Cache Warming Validation:**
1. Wait for cache warming to trigger (9:00 AM ET or manual invoke)
2. Check CloudWatch Logs for warming completion
3. Immediately request warmed ticker (e.g., AAPL)
4. Verify response time <200ms (cache hit)
5. Verify DynamoDB shows cached data with fresh TTL

**Cost Validation:**
1. Run cost analysis script for last 30 days
2. Compare to AWS billing dashboard
3. Verify savings match expected values (25-35%)
4. Trigger cost anomaly alarm (manual test)
5. Verify SNS notification received

### Performance Validation

Run benchmarks and verify improvements:

| Metric | Baseline (Before) | Optimized (After) | Improvement |
|--------|-------------------|-------------------|-------------|
| Single ticker latency (p50) | 800ms | 300ms | 62% faster |
| Portfolio load (10 tickers) | 12s | 3s | 75% faster |
| API Gateway cache hit rate | 0% | 75% | - |
| Lambda invocations/day | 10,000 | 6,000 | 40% reduction |
| DynamoDB read units/day | 50,000 | 40,000 | 20% reduction |
| Monthly cost | $150 | $100 | 33% savings |

### Known Limitations

1. **Cache warming limited to top 20 tickers:**
   - Long-tail tickers still experience cold cache
   - **Mitigation:** Consider expanding to top 50 based on usage patterns
   - **Trade-off:** Higher warming cost ($0.50/day vs $0.20/day)

2. **Batch API limited to 10 tickers:**
   - Large portfolios (>10 tickers) require multiple batch requests
   - **Mitigation:** Frontend automatically chunks into batches of 10
   - **Future enhancement:** Increase limit if Lambda timeout allows

3. **Provisioned concurrency cost:**
   - If enabled, costs ~$10/day during market hours
   - **Recommendation:** Only enable if cold starts >10% of requests
   - **Monitor:** Cold start percentage metric in dashboard

4. **Manual top ticker refresh:**
   - Top ticker list requires manual CloudWatch query and update
   - **Future automation:** Lambda function to auto-update weekly
   - **Current process:** Run query monthly, update DynamoDB manually

### Success Metrics Validation

Verify all optimization goals achieved:

**Performance:**
- [x] API Gateway cache hit rate >70% for stable data
- [x] Average response latency <500ms (p50), <1000ms (p99)
- [x] Cold start frequency <1% during market hours (with provisioned concurrency)
- [x] Portfolio loading 60% faster with batch API

**Cost Reductions:**
- [x] Lambda invocations: -40% (API Gateway caching + batch API)
- [x] DynamoDB read units: -20% (longer TTL + cache warming)
- [x] Data transfer: -30% (compression)
- [x] Total monthly cost: -25-35% reduction

**User Experience:**
- [x] First request for popular tickers <200ms (cache warming)
- [x] Portfolio loading <3 seconds for 10 tickers (batch API)
- [x] No breaking changes to existing API
- [x] Backward compatibility maintained

---

## Deployment Guide

### Pre-Deployment Checklist

- [ ] Phase 1 deployed and verified
- [ ] All Phase 2 tests passing in CI
- [ ] `.deploy-config.json` updated with new parameters
- [ ] Frontend code changes ready to deploy

### Deployment Steps

1. **Deploy backend changes:**
   ```bash
   cd backend
   npm run deploy
   ```
   - Verify batch endpoints deployed
   - Verify cache warming function deployed
   - Verify EventBridge rules created

2. **Update CloudWatch dashboard:**
   ```bash
   cd backend/scripts
   ./create-dashboard.sh
   ```
   - Verify dashboard visible in AWS Console
   - Verify all widgets display data

3. **Deploy frontend changes:**
   ```bash
   npm run build
   # Deploy to hosting platform (Vercel, Netlify, etc.)
   ```
   - Verify batch API integration works
   - Test portfolio loading with >3 tickers

4. **Configure CloudWatch alarms:**
   - Subscribe to SNS topic for notifications
   - Test alarm by manually triggering threshold breach
   - Adjust thresholds based on actual usage patterns

5. **Run initial benchmarks:**
   ```bash
   cd backend
   tsx scripts/benchmark.ts --scenario all --iterations 100
   ```
   - Document baseline optimized performance
   - Compare to pre-optimization baseline from Phase 1

### Post-Deployment Verification

1. **Functional testing:**
   - Load portfolio with 10 tickers
   - Verify batch API called (3 requests)
   - Verify data displays correctly
   - Test cache warming (wait for 9:00 AM ET or manual trigger)

2. **Performance monitoring:**
   - Open CloudWatch dashboard
   - Monitor cache hit rates for 24 hours
   - Verify Lambda invocations decreased
   - Check for errors or anomalies

3. **Cost tracking:**
   - Run cost analysis script after 7 days
   - Compare to previous 30-day period
   - Verify savings align with projections
   - Adjust optimizations if needed

---

## Next Steps and Future Enhancements

### Completed Optimizations

✅ API Gateway response caching (Phase 1)
✅ Lambda memory/timeout tuning (Phase 1)
✅ DynamoDB variable TTL (Phase 1)
✅ Response compression (Phase 1)
✅ Request batching API (Phase 2)
✅ Cache warming system (Phase 2)
✅ CloudWatch dashboard (Phase 2)
✅ Cost analysis and alerting (Phase 2)

### Potential Future Improvements

1. **Per-Endpoint Lambda Functions** (deferred from Phase 1):
   - Split single Lambda into separate functions per endpoint
   - Optimize memory/timeout individually
   - **Benefit:** 20-30% additional cost savings
   - **Effort:** Medium (requires code reorganization)
   - **Trigger:** When cost analysis shows over-provisioning

2. **Automated Top Ticker Refresh:**
   - Lambda function to run CloudWatch Logs Insights weekly
   - Auto-update TopTickersCache table
   - **Benefit:** Reduces manual work
   - **Effort:** Low (simple Lambda + EventBridge rule)

3. **Multi-Region Deployment:**
   - Deploy to multiple AWS regions
   - Use Route53 for latency-based routing
   - **Benefit:** Lower latency for global users
   - **Effort:** High (multi-region CloudFormation, DynamoDB Global Tables)

4. **GraphQL API:**
   - Replace REST API with GraphQL
   - Clients request only needed fields
   - **Benefit:** Smaller payloads, fewer round-trips
   - **Effort:** High (requires API redesign)

5. **DynamoDB DAX:**
   - Add DAX cluster for microsecond cache latency
   - **Benefit:** 10x faster cache reads
   - **Effort:** Low (add DAX cluster to SAM template)
   - **Cost:** $0.04/hour (~$30/month)

6. **Batch Sentiment Job Creation:**
   - POST /batch/sentiment to create jobs for multiple tickers
   - Parallel async processing
   - **Benefit:** Faster sentiment analysis for portfolios
   - **Effort:** Medium (complex job tracking)

---

## Conclusion

Phase 2 completes the API Gateway optimization project by implementing application-level features that maximize the infrastructure improvements from Phase 1. The combination of batch APIs, cache warming, comprehensive monitoring, and cost tracking delivers:

- **60% faster portfolio loading** (batch API)
- **80% of users see <200ms first-request latency** (cache warming)
- **40% reduction in Lambda invocations** (API Gateway cache + batch API)
- **25-35% total cost savings** (all optimizations combined)
- **Full visibility** into optimization impact (CloudWatch dashboard)
- **Proactive cost management** (alerts and analysis tools)

All optimizations maintain **100% backward compatibility** with existing API, ensuring zero downtime and no breaking changes for frontend clients.

The project successfully transforms a working API Gateway setup into a **production-optimized, cost-efficient, and highly performant** infrastructure ready to scale with user growth.

**Total Optimization Impact:**
- Performance: **30-60% latency reduction**
- Cost: **25-35% monthly savings**
- Scalability: **Ready for 5-10x traffic growth**
- Observability: **Comprehensive metrics and dashboards**

---

**Project Complete!** 🎉
