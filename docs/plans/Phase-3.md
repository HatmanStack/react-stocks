# Phase 3: Async Sentiment Processing

## Phase Goal

Implement asynchronous sentiment analysis in Lambda, eliminating the 45+ second UI hang by processing sentiment in the background. Lambda will analyze articles server-side and cache results in DynamoDB, with job tracking enabling the frontend to poll for completion status.

**Success Criteria:**
- ✅ Lambda endpoint processes sentiment analysis asynchronously
- ✅ Job tracking table maintains status (PENDING → IN_PROGRESS → COMPLETED)
- ✅ Sentiment analyzer ported from frontend to Lambda (Node.js compatible)
- ✅ Batch sentiment analysis completes in <15 seconds for 30-day range
- ✅ Results cached in SentimentCache table with 90-day TTL
- ✅ GET endpoint returns job status and results when complete

**Estimated tokens:** ~45,000

---

## Prerequisites

- **Phase 2 complete**: Stock and news caching functional
- **All Phase 2 tests passing**: Endpoints using cache correctly
- **DynamoDB tables deployed**: SentimentCache and SentimentJobs tables exist
- **Understand async patterns**: Review Phase-0.md ADR-2

---

## Tasks

### Task 3.1: Port Sentiment Analyzer to Lambda

**Goal:** Copy sentiment analysis logic from frontend to backend, making it compatible with Node.js Lambda environment (remove React Native dependencies).

**Files to Create:**
- `backend/src/ml/sentiment/analyzer.ts` - Core sentiment analysis logic
- `backend/src/ml/sentiment/lexicon.ts` - Financial sentiment lexicon
- `backend/src/ml/sentiment/index.ts` - Barrel export
- `backend/src/ml/sentiment/__tests__/analyzer.test.ts` - Unit tests

**Prerequisites:**
- Review `src/ml/sentiment/analyzer.ts` in frontend
- Understand differences between frontend and backend environments

**Implementation Steps:**

1. **Copy analyzer logic** from `src/ml/sentiment/analyzer.ts`:
   - Remove React Native specific imports (e.g., `import { Platform } from 'react-native'`)
   - Keep core analysis algorithms unchanged
   - Ensure Node.js compatibility (use Buffer instead of web APIs if needed)

2. **Copy lexicon** from `src/ml/sentiment/lexicon.ts`:
   - AFINN word scores
   - Financial domain terms
   - No changes needed (pure data structure)

3. **Create TypeScript interfaces**:
   ```typescript
   interface SentimentResult {
     positive: number;
     negative: number;
     neutral: number;
     positiveConfidence: number;
     negativeConfidence: number;
     neutralConfidence: number;
   }

   interface ArticleSentiment {
     articleHash: string;
     sentiment: SentimentResult;
     sentimentScore: number;
     classification: 'POS' | 'NEG' | 'NEUT';
   }
   ```

4. **Implement main analysis function**:
   ```typescript
   export async function analyzeSentiment(
     text: string,
     articleHash: string
   ): Promise<ArticleSentiment>
   ```
   - Split text into sentences
   - Analyze each sentence using AFINN scores
   - Aggregate to positive/negative/neutral counts
   - Calculate sentiment score and classification

5. **Add batch analysis helper**:
   ```typescript
   export async function analyzeSentimentBatch(
     articles: Array<{ text: string; hash: string }>
   ): Promise<ArticleSentiment[]>
   ```
   - Use `Promise.all()` for parallel processing
   - Return array of results matching input order

6. **Remove any async wrappers** not needed in Lambda:
   - Frontend may have React-specific async patterns
   - Lambda can use simple async/await

**Verification Checklist:**
- [ ] No React Native dependencies imported
- [ ] Sentiment algorithm identical to frontend implementation
- [ ] TypeScript compiles without errors
- [ ] Batch analysis processes articles in parallel
- [ ] Results match frontend analyzer output (test with same text)

**Testing Instructions:**

Create comprehensive unit tests:

- **Test single article analysis**:
  - Analyze positive text: "Stock soared to record highs on strong earnings"
  - Verify classification is 'POS'
  - Verify positive count > negative count

- **Test negative sentiment**:
  - Analyze negative text: "Company plunged after disappointing guidance"
  - Verify classification is 'NEG'

- **Test neutral sentiment**:
  - Analyze neutral text: "Company released quarterly report"
  - Verify classification is 'NEUT'

- **Test batch analysis**:
  - Analyze 50 articles
  - Verify all results returned
  - Verify results order matches input order

- **Test consistency with frontend**:
  - Use same test text on frontend and backend
  - Verify sentiment scores match (within 0.01 tolerance)

Run tests: `cd backend && npm test -- ml/sentiment`

**Commit Message Template:**
```
feat(ml): port sentiment analyzer from frontend to Lambda

- Copy sentiment analysis logic to backend/src/ml/sentiment/
- Remove React Native dependencies for Node.js compatibility
- Preserve identical algorithm (results match frontend)
- Add batch analysis for parallel processing
- Comprehensive unit tests ensuring consistency
- Verified output matches frontend analyzer

Task: Phase 3, Task 3.1
```

**Estimated tokens:** ~7,000

---

### Task 3.2: Create Sentiment Processing Service

**Goal:** Build service layer that orchestrates sentiment analysis workflow: fetch news → check cache → analyze → store results.

**Files to Create:**
- `backend/src/services/sentimentProcessing.service.ts` - Orchestration logic
- `backend/src/services/__tests__/sentimentProcessing.service.test.ts` - Unit tests

**Prerequisites:**
- Task 3.1 complete (analyzer ported)
- Phase 2 complete (news cache functional)

**Implementation Steps:**

1. **Create service with main processing function**:
   ```typescript
   export async function processSentimentForTicker(
     ticker: string,
     startDate: string,
     endDate: string
   ): Promise<SentimentProcessingResult>
   ```

2. **Implement processing workflow**:
   - **Step 1**: Fetch news articles from cache (NewsCache)
     - Use `queryArticlesByTicker(ticker)`
     - Filter by date range
   - **Step 2**: Check which articles already have sentiment (SentimentCache)
     - Use `existsInCache(ticker, articleHash)` for each article
     - Skip articles with existing sentiment (deduplication)
   - **Step 3**: Analyze new articles
     - Use `analyzeSentimentBatch()` for parallel processing
     - Extract article text (title + description)
   - **Step 4**: Cache results
     - Use `batchPutSentiments()` to store in SentimentCache
     - Set TTL to 90 days
   - **Step 5**: Aggregate daily sentiment
     - Group sentiment by date
     - Sum positive/negative counts per day
     - Calculate daily sentiment score

3. **Return processing result**:
   ```typescript
   interface SentimentProcessingResult {
     ticker: string;
     articlesProcessed: number;
     articlesSkipped: number; // Already cached
     dailySentiment: Array<{
       date: string;
       positive: number;
       negative: number;
       sentimentScore: number;
       classification: 'POS' | 'NEG' | 'NEUT';
     }>;
     processingTimeMs: number;
   }
   ```

4. **Add progress callback support** (optional, for monitoring):
   ```typescript
   type ProgressCallback = (progress: {
     step: string;
     current: number;
     total: number;
   }) => void;
   ```

5. **Implement error handling**:
   - If news articles not in cache, return error (require news sync first)
   - If sentiment analysis fails for an article, log error but continue with others
   - If DynamoDB write fails, retry up to 3 times

**Verification Checklist:**
- [ ] Service fetches news from cache (doesn't call API directly)
- [ ] Deduplication prevents re-analyzing cached sentiment
- [ ] Batch analysis processes all articles in parallel
- [ ] Results cached with 90-day TTL
- [ ] Daily sentiment aggregated correctly
- [ ] Error handling allows partial success (some articles fail, others succeed)

**Testing Instructions:**

Create unit tests with mocked repositories:

- **Test full processing flow**:
  - Mock NewsCache with 20 articles
  - Mock SentimentCache as empty (all cache misses)
  - Verify all 20 articles analyzed
  - Verify 20 sentiments cached
  - Verify daily sentiment aggregated

- **Test deduplication**:
  - Mock NewsCache with 20 articles
  - Mock SentimentCache with 10 existing sentiments
  - Verify only 10 new articles analyzed
  - Verify `articlesSkipped: 10` in result

- **Test error handling**:
  - Mock analyzer to throw error for 5 articles
  - Verify other 15 articles still processed
  - Verify errors logged but not thrown

Run tests: `cd backend && npm test -- services/sentimentProcessing.service`

**Commit Message Template:**
```
feat(service): create sentiment processing orchestration service

- Implement end-to-end workflow: fetch news → check cache → analyze → store
- Add deduplication to skip articles with existing sentiment
- Batch analyze new articles in parallel
- Cache results with 90-day TTL in SentimentCache
- Aggregate daily sentiment from article-level results
- Comprehensive error handling for partial failures
- Unit tests with mocked repositories

Task: Phase 3, Task 3.2
```

**Estimated tokens:** ~8,000

---

### Task 3.3: Create POST /sentiment Endpoint

**Goal:** Create Lambda endpoint that triggers async sentiment processing and returns job ID for status polling.

**Files to Create:**
- `backend/src/handlers/sentiment.handler.ts` - Sentiment endpoint handlers
- `backend/src/handlers/__tests__/sentiment.handler.test.ts` - Unit tests

**Prerequisites:**
- Task 3.2 complete (processing service ready)
- SentimentJobs repository functional (Phase 1)

**Implementation Steps:**

1. **Create POST handler** for initiating sentiment analysis:
   ```typescript
   export async function handleSentimentRequest(
     event: APIGatewayProxyEventV2
   ): Promise<APIGatewayResponse>
   ```

2. **Parse request body**:
   - Expect JSON: `{ ticker: string, startDate: string, endDate: string }`
   - Validate all fields present (return 400 if missing)
   - Validate date format (YYYY-MM-DD)

3. **Generate job ID**:
   - Use `generateJobId(ticker, startDate, endDate)` from job.util.ts
   - Deterministic ID allows idempotent requests

4. **Check for existing job**:
   - Use `SentimentJobsRepository.getJob(jobId)`
   - If job exists and status is COMPLETED, return `{ jobId, status: 'COMPLETED', cached: true }`
   - If job exists and status is IN_PROGRESS, return `{ jobId, status: 'IN_PROGRESS', cached: true }`

5. **Create new job**:
   - Use `SentimentJobsRepository.createJob()` with status PENDING
   - Return `{ jobId, status: 'PENDING', cached: false }` immediately (don't wait for processing)

6. **Trigger async processing**:
   - **Option A (Simple)**: Process in same Lambda invocation (blocking, but return response first is not possible)
   - **Option B (Recommended)**: Invoke separate Lambda asynchronously
   - **Option C (Simplest for MVP)**: Process synchronously but quickly (< 15s Lambda timeout is fine)

   For MVP, use **Option C** (synchronous processing):
   - Create job with status IN_PROGRESS
   - Call `processSentimentForTicker()`
   - Update job status to COMPLETED or FAILED
   - Return result

   This is simpler than async invoke and works fine if processing <15s.

7. **Handle processing errors**:
   - Wrap processing in try/catch
   - If error, update job status to FAILED
   - Store error message in job record

**Verification Checklist:**
- [ ] POST endpoint accepts JSON body with ticker and date range
- [ ] Job ID generated deterministically (same input = same ID)
- [ ] Existing completed jobs return cached response
- [ ] New jobs create record in SentimentJobs table
- [ ] Processing completes within Lambda timeout (15 min, but aim for <30s)
- [ ] Job status updated to COMPLETED or FAILED after processing
- [ ] CORS headers included in response

**Testing Instructions:**

Create integration tests:

- **Test new sentiment analysis**:
  - POST `{ ticker: 'AAPL', startDate: '2025-01-01', endDate: '2025-01-30' }`
  - Verify response has jobId
  - Verify job status transitions to COMPLETED (if synchronous)
  - Verify sentiment cached in DynamoDB

- **Test idempotency**:
  - POST same request twice
  - Verify same jobId returned
  - Verify second request returns cached status

- **Test validation errors**:
  - POST missing ticker, verify 400 error
  - POST invalid date format, verify 400 error

Run tests: `cd backend && npm test -- handlers/sentiment.handler`

**Commit Message Template:**
```
feat(lambda): create POST /sentiment endpoint for async processing

- Accept JSON body with ticker and date range
- Generate deterministic job ID for idempotent requests
- Check for existing jobs (return cached if completed)
- Create new job and process sentiment synchronously
- Update job status to COMPLETED or FAILED
- Store results in SentimentCache table
- Comprehensive integration tests

Task: Phase 3, Task 3.3
```

**Estimated tokens:** ~9,000

---

### Task 3.4: Create GET /sentiment/job/:jobId Endpoint

**Goal:** Create endpoint for polling job status, allowing frontend to check when sentiment analysis is complete.

**Files to Modify:**
- `backend/src/handlers/sentiment.handler.ts` - Add GET handler

**Prerequisites:**
- Task 3.3 complete (POST endpoint functional)

**Implementation Steps:**

1. **Create GET handler** for job status:
   ```typescript
   export async function handleSentimentJobStatusRequest(
     event: APIGatewayProxyEventV2
   ): Promise<APIGatewayResponse>
   ```

2. **Parse job ID from path**:
   - Extract `jobId` from path parameters
   - Validate jobId is present (return 400 if missing)

3. **Fetch job from database**:
   - Use `SentimentJobsRepository.getJob(jobId)`
   - Return 404 if job not found

4. **Return job status**:
   ```json
   {
     "jobId": "AAPL_2025-01-01_2025-01-30",
     "status": "COMPLETED",
     "ticker": "AAPL",
     "startDate": "2025-01-01",
     "endDate": "2025-01-30",
     "articlesProcessed": 45,
     "startedAt": 1736123456789,
     "completedAt": 1736123470123,
     "durationMs": 13334
   }
   ```

5. **Include error details if job failed**:
   ```json
   {
     "jobId": "...",
     "status": "FAILED",
     "error": "Failed to analyze sentiment: API timeout"
   }
   ```

**Verification Checklist:**
- [ ] Job ID parsed from path parameters
- [ ] 404 returned for non-existent jobs
- [ ] Status includes all relevant job metadata
- [ ] Error message included if status is FAILED
- [ ] CORS headers included

**Testing Instructions:**

Create integration tests:

- **Test successful job status**:
  - Create completed job
  - GET `/sentiment/job/{jobId}`
  - Verify response includes status COMPLETED

- **Test pending job status**:
  - Create pending job
  - GET status, verify PENDING

- **Test failed job status**:
  - Create failed job with error message
  - GET status, verify FAILED and error included

- **Test non-existent job**:
  - GET `/sentiment/job/INVALID_ID`
  - Verify 404 response

Run tests: `cd backend && npm test -- handlers/sentiment.handler`

**Commit Message Template:**
```
feat(lambda): create GET /sentiment/job/:jobId endpoint for status polling

- Parse job ID from path parameters
- Fetch job status from SentimentJobs table
- Return complete job metadata including timestamps
- Include error message if job failed
- Return 404 for non-existent jobs
- Integration tests for all job statuses

Task: Phase 3, Task 3.4
```

**Estimated tokens:** ~5,000

---

### Task 3.5: Create GET /sentiment Endpoint for Results Retrieval

**Goal:** Create endpoint to fetch cached sentiment results by ticker and date range.

**Files to Modify:**
- `backend/src/handlers/sentiment.handler.ts` - Add GET sentiment results handler

**Prerequisites:**
- Task 3.3 complete (sentiment cached in DynamoDB)

**Implementation Steps:**

1. **Create GET handler** for sentiment results:
   ```typescript
   export async function handleSentimentResultsRequest(
     event: APIGatewayProxyEventV2
   ): Promise<APIGatewayResponse>
   ```

2. **Parse query parameters**:
   - Extract `ticker`, `startDate`, `endDate` (optional, defaults to last 30 days)
   - Validate ticker is provided

3. **Fetch cached sentiment**:
   - Use `SentimentCacheRepository.querySentimentsByTicker(ticker)`
   - Filter by date range if provided

4. **Aggregate by date** (if not already aggregated):
   - Group article-level sentiment by date
   - Sum positive/negative counts per day
   - Calculate daily sentiment score

5. **Return results**:
   ```json
   {
     "ticker": "AAPL",
     "startDate": "2025-01-01",
     "endDate": "2025-01-30",
     "dailySentiment": [
       {
         "date": "2025-01-15",
         "positive": 12,
         "negative": 3,
         "sentimentScore": 0.75,
         "classification": "POS"
       },
       ...
     ],
     "cached": true
   }
   ```

6. **Handle cache miss**:
   - If no sentiment cached, return empty array (don't trigger analysis)
   - Frontend will call POST /sentiment to trigger analysis

**Verification Checklist:**
- [ ] Query parameters parsed correctly
- [ ] Sentiment fetched from cache (not computed on-demand)
- [ ] Daily aggregation groups by date correctly
- [ ] Empty array returned for cache miss (not error)
- [ ] CORS headers included

**Testing Instructions:**

Create integration tests:

- **Test cached sentiment retrieval**:
  - Cache sentiment for AAPL (20 articles over 10 days)
  - GET `/sentiment?ticker=AAPL&startDate=2025-01-01&endDate=2025-01-30`
  - Verify 10 daily aggregates returned
  - Verify cached: true

- **Test cache miss**:
  - GET sentiment for ticker with no cached data
  - Verify empty array returned
  - Verify cached: false

- **Test date range filtering**:
  - Cache sentiment for 30 days
  - Request only 10 days
  - Verify only 10 days returned

Run tests: `cd backend && npm test -- handlers/sentiment.handler`

**Commit Message Template:**
```
feat(lambda): create GET /sentiment endpoint for cached results retrieval

- Parse ticker and date range from query parameters
- Fetch cached sentiment from SentimentCache
- Aggregate article sentiment by date
- Return daily sentiment scores and classifications
- Handle cache miss with empty array (no on-demand computation)
- Integration tests for all scenarios

Task: Phase 3, Task 3.5
```

**Estimated tokens:** ~6,000

---

### Task 3.6: Update SAM Template with Sentiment Routes

**Goal:** Add sentiment endpoints to API Gateway routing in SAM template.

**Files to Modify:**
- `backend/template.yaml` - Add sentiment API routes
- `backend/src/index.ts` - Route sentiment requests to handlers

**Prerequisites:**
- Tasks 3.3-3.5 complete (handlers implemented)

**Implementation Steps:**

1. **Add POST /sentiment route** to template.yaml:
   ```yaml
   SentimentPostApi:
     Type: HttpApi
     Properties:
       ApiId: !Ref ReactStocksApi
       Path: /sentiment
       Method: POST
   ```

2. **Add GET /sentiment route**:
   ```yaml
   SentimentGetApi:
     Type: HttpApi
     Properties:
       ApiId: !Ref ReactStocksApi
       Path: /sentiment
       Method: GET
   ```

3. **Add GET /sentiment/job/{jobId} route**:
   ```yaml
   SentimentJobStatusApi:
     Type: HttpApi
     Properties:
       ApiId: !Ref ReactStocksApi
       Path: /sentiment/job/{jobId}
       Method: GET
   ```

4. **Update index.ts router**:
   - Add case for POST `/sentiment`:
     ```typescript
     case '/sentiment': {
       if (method === 'POST') {
         const { handleSentimentRequest } = await import('./handlers/sentiment.handler');
         return handleSentimentRequest(event);
       } else if (method === 'GET') {
         const { handleSentimentResultsRequest } = await import('./handlers/sentiment.handler');
         return handleSentimentResultsRequest(event);
       }
     }
     ```
   - Add case for GET `/sentiment/job/{jobId}`:
     ```typescript
     case '/sentiment/job/{jobId}': {
       const { handleSentimentJobStatusRequest } = await import('./handlers/sentiment.handler');
       return handleSentimentJobStatusRequest(event);
     }
     ```

5. **Update CORS configuration** (if needed):
   - Ensure POST method allowed in CorsConfiguration
   - Add to AllowMethods: `POST`

**Verification Checklist:**
- [ ] All 3 routes defined in template.yaml
- [ ] index.ts routes requests to correct handlers
- [ ] POST method allowed in CORS configuration
- [ ] Path parameters correctly defined for /sentiment/job/{jobId}
- [ ] Template validates: `sam validate`

**Testing Instructions:**

- **Test template validation**:
  - Run `sam validate --template backend/template.yaml`
  - Verify no errors

- **Test routing** (after deployment):
  - POST to /sentiment, verify handler invoked
  - GET /sentiment, verify handler invoked
  - GET /sentiment/job/test123, verify jobId extracted

**Commit Message Template:**
```
feat(api): add sentiment endpoints to API Gateway routes

- Add POST /sentiment route for triggering analysis
- Add GET /sentiment route for fetching cached results
- Add GET /sentiment/job/{jobId} route for status polling
- Update index.ts router to handle sentiment requests
- Update CORS configuration to allow POST method
- Validate template syntax

Task: Phase 3, Task 3.6
```

**Estimated tokens:** ~4,000

---

### Task 3.7: Optimize Sentiment Processing Performance

**Goal:** Optimize sentiment analysis to complete within 15 seconds for 30-day range (50+ articles).

**Files to Modify:**
- `backend/src/ml/sentiment/analyzer.ts` - Performance optimizations
- `backend/src/services/sentimentProcessing.service.ts` - Batch optimizations

**Prerequisites:**
- Task 3.2 complete (processing service functional)
- Initial performance baseline established

**Implementation Steps:**

1. **Profile current performance**:
   - Add timing logs to each step of processing
   - Identify bottlenecks (likely: DynamoDB batch operations or text analysis)

2. **Optimize text analysis**:
   - **Cache lexicon lookups**: Pre-compute word scores
   - **Limit sentence splitting**: Cap at 20 sentences per article (long articles)
   - **Parallelize article analysis**: Ensure `Promise.all()` used correctly

3. **Optimize DynamoDB operations**:
   - **Batch existence checks**: Instead of checking each article individually, batch query
   - **Batch writes**: Ensure using `batchWriteItem` with max 25 items per request
   - **Parallel reads and writes**: Don't await sequentially

4. **Add performance metrics**:
   - Log processing time per article
   - Log total processing time
   - Log cache hit rate (articles skipped due to existing sentiment)

5. **Consider Lambda memory optimization**:
   - Test with 512MB, 1024MB, 2048MB memory
   - Higher memory = faster CPU (AWS Lambda scales both together)
   - Balance cost vs performance

**Verification Checklist:**
- [ ] 30-day range (50 articles) completes in <15 seconds
- [ ] Average analysis time <300ms per article
- [ ] DynamoDB batch operations used correctly
- [ ] Performance metrics logged for monitoring

**Testing Instructions:**

Create performance tests:

- **Benchmark 50 articles**:
  - Mock 50 news articles
  - Time `processSentimentForTicker()`
  - Verify completes in <15s
  - Log individual step timings

- **Test with cache hits**:
  - Mock 25 articles with existing sentiment
  - Verify only 25 new articles analyzed
  - Verify faster than full 50-article analysis

Run tests: `cd backend && npm test -- services/sentimentProcessing.service.perf`

**Commit Message Template:**
```
perf(sentiment): optimize sentiment processing for <15s completion

- Add timing logs to identify bottlenecks
- Optimize text analysis with cached lexicon lookups
- Batch DynamoDB existence checks for deduplication
- Parallel batch writes for sentiment results
- Add performance metrics for monitoring
- Benchmark: 50 articles processed in ~12 seconds

Task: Phase 3, Task 3.7
```

**Estimated tokens:** ~5,000

---

### Task 3.8: Add Sentiment Processing Error Recovery

**Goal:** Implement robust error handling and retry logic for sentiment processing failures.

**Files to Modify:**
- `backend/src/services/sentimentProcessing.service.ts` - Add error recovery
- `backend/src/handlers/sentiment.handler.ts` - Improve error responses

**Prerequisites:**
- Task 3.3 complete (handler functional)

**Implementation Steps:**

1. **Classify errors**:
   - **Transient errors**: DynamoDB throttling, network timeouts (retryable)
   - **Permanent errors**: Invalid ticker, no news articles (not retryable)
   - **Partial errors**: Some articles fail analysis (continue with others)

2. **Add retry logic for transient errors**:
   - Use `withRetry()` utility from Phase 1
   - Retry DynamoDB operations up to 3 times
   - Exponential backoff: 1s, 2s, 4s

3. **Handle partial failures**:
   - If 5 out of 50 articles fail analysis, continue with 45 successful
   - Log failed articles but don't fail entire job
   - Include `failedArticles` count in job result

4. **Add detailed error messages**:
   - If no news articles found: "No news articles found for {ticker} in date range. Please sync news first."
   - If DynamoDB throttling: "Processing temporarily delayed due to high demand. Retrying..."
   - If analysis timeout: "Sentiment analysis timed out. Try smaller date range."

5. **Store errors in job record**:
   - Update `SentimentJob` to include `errorDetails` array
   - Each failed article gets entry: `{ articleHash, error }`

6. **Add job timeout handling**:
   - If Lambda approaching timeout (14.5 minutes), mark job as FAILED
   - Include partial results if any articles processed successfully

**Verification Checklist:**
- [ ] Transient errors retried with exponential backoff
- [ ] Partial failures logged but don't stop processing
- [ ] Detailed error messages help debug issues
- [ ] Job status includes error details
- [ ] Timeout handling prevents incomplete jobs

**Testing Instructions:**

Create error scenario tests:

- **Test DynamoDB throttling**:
  - Mock DynamoDB to throw throttling error
  - Verify retries occur
  - Verify eventually succeeds or fails gracefully

- **Test partial article failure**:
  - Mock analyzer to fail for 10 out of 50 articles
  - Verify 40 articles processed successfully
  - Verify job status includes failedArticles count

- **Test no news articles**:
  - Mock NewsCache as empty
  - Verify error message indicates news sync needed

Run tests: `cd backend && npm test -- services/sentimentProcessing.service.error`

**Commit Message Template:**
```
feat(error-handling): add robust error recovery for sentiment processing

- Classify errors as transient, permanent, or partial
- Retry transient errors with exponential backoff
- Handle partial failures (continue processing remaining articles)
- Store detailed error information in job records
- Add timeout handling for long-running jobs
- Comprehensive error scenario tests

Task: Phase 3, Task 3.8
```

**Estimated tokens:** ~6,000

---

### Task 3.9: Deploy and Validate Async Sentiment Processing

**Goal:** Deploy sentiment endpoints to production and validate end-to-end async processing workflow.

**Files to Modify:**
- None (deployment and testing only)

**Prerequisites:**
- All Phase 3 tasks complete
- All tests passing
- Code committed

**Implementation Steps:**

1. **Run full test suite**:
   - Unit tests: `cd backend && npm test`
   - Integration tests: Focus on sentiment handlers
   - Performance tests: Verify <15s for 30-day range

2. **Build and deploy**:
   - Run `sam build` in `backend/`
   - Run `sam deploy`
   - Confirm changeset (should show new routes added)

3. **Validate POST /sentiment**:
   - Trigger sentiment analysis:
     ```bash
     curl -X POST https://your-api.execute-api.us-east-1.amazonaws.com/sentiment \
       -H "Content-Type: application/json" \
       -d '{"ticker":"AAPL","startDate":"2025-01-01","endDate":"2025-01-30"}'
     ```
   - Verify response includes jobId
   - Note jobId for next step

4. **Validate GET /sentiment/job/{jobId}**:
   - Poll job status:
     ```bash
     curl https://your-api.execute-api.us-east-1.amazonaws.com/sentiment/job/{jobId}
     ```
   - Verify status transitions to COMPLETED
   - Verify articlesProcessed count matches expected

5. **Validate GET /sentiment**:
   - Fetch cached results:
     ```bash
     curl "https://your-api.execute-api.us-east-1.amazonaws.com/sentiment?ticker=AAPL&startDate=2025-01-01&endDate=2025-01-30"
     ```
   - Verify daily sentiment aggregates returned
   - Verify cached: true

6. **Check DynamoDB tables**:
   - Open DynamoDB Console
   - Verify SentimentCache has items for AAPL
   - Verify SentimentJobs has completed job record
   - Verify TTL set correctly (~90 days for sentiment)

7. **Check CloudWatch Logs**:
   - Open CloudWatch Logs for Lambda function
   - Verify sentiment processing logs present
   - Check for any errors or warnings

8. **Performance validation**:
   - Trigger analysis for 30-day range
   - Measure time from POST to job COMPLETED
   - Verify <15 seconds for typical stock (50 articles)

**Verification Checklist:**
- [ ] Deployment successful without errors
- [ ] POST /sentiment creates job and processes sentiment
- [ ] GET /sentiment/job/{jobId} returns correct status
- [ ] GET /sentiment returns cached results
- [ ] DynamoDB tables contain expected data
- [ ] Processing completes in <15 seconds for 30-day range
- [ ] CloudWatch Logs show no errors

**Testing Instructions:**

Run live end-to-end tests:

- **Test full workflow**:
  1. POST sentiment analysis request
  2. Poll job status until COMPLETED
  3. Fetch sentiment results
  4. Verify results match expected format

- **Test idempotency**:
  1. POST same request twice
  2. Verify second request returns existing job
  3. Verify no duplicate processing

- **Test error scenarios**:
  1. POST with invalid ticker
  2. Verify appropriate error message
  3. GET non-existent job
  4. Verify 404 response

**Commit Message Template:**
```
chore(deploy): deploy async sentiment processing to production

- Successfully deployed POST/GET /sentiment endpoints
- Validated end-to-end workflow: trigger → poll → fetch results
- Verified <15s processing time for 30-day ranges
- Confirmed DynamoDB caching with 90-day TTL
- CloudWatch Logs show successful processing
- No errors or performance issues detected

Task: Phase 3, Task 3.9
```

**Estimated tokens:** ~5,000

---

## Phase Verification

After completing all tasks, verify the entire phase:

**Functional Validation:**
- [ ] POST /sentiment triggers async sentiment analysis
- [ ] GET /sentiment/job/{jobId} returns accurate job status
- [ ] GET /sentiment returns cached sentiment results
- [ ] Sentiment analyzer produces consistent results (matches frontend)
- [ ] Job lifecycle follows PENDING → IN_PROGRESS → COMPLETED workflow

**Performance Validation:**
- [ ] 30-day range (50 articles) processes in <15 seconds
- [ ] Cache hit rate >90% for popular stocks after first analysis
- [ ] DynamoDB operations batched correctly
- [ ] Lambda memory optimized for performance vs cost

**Testing Validation:**
- [ ] All unit tests passing: `cd backend && npm test -- ml/`
- [ ] All integration tests passing: `cd backend && npm test -- handlers/sentiment`
- [ ] Performance benchmarks meet targets
- [ ] Error recovery tests validate retry logic

**Monitoring Validation:**
- [ ] CloudWatch Logs show processing steps
- [ ] CloudWatch Metrics track performance (if Task 2.4 completed)
- [ ] DynamoDB Console shows cached sentiment with correct TTL
- [ ] SentimentJobs table shows completed jobs

**Known Limitations:**
- Frontend still uses local sentiment sync (will update in Phase 4)
- No WebSocket support (polling only) - acceptable for MVP
- Sentiment processing synchronous in Lambda (not separate async invoke) - acceptable if <15s

---

## Next Steps

✅ **Phase 3 Complete!** You now have:
- Async sentiment processing in Lambda
- Job tracking with status polling
- Sentiment analyzer ported to backend
- Cache-aware sentiment results
- <15 second processing for typical stocks

**Proceed to Phase 4:** Update frontend to use async sentiment endpoints and display progressive loading.

→ **[Phase 4: Frontend Async Loading](./Phase-4.md)**
