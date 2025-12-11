# Phase 1: Implementation

## Phase Goal

Implement the yfinance-based Python Lambda to replace Tiingo for all stock-related endpoints. Remove Tiingo integration code. Update deployment configuration.

**Success Criteria:**
- Python Lambda handles `/stocks`, `/search`, `/batch/stocks` endpoints
- Response format identical to current Tiingo responses
- DynamoDB caching operational
- All tests pass
- Tiingo code removed
- Deployment script updated

**Estimated Tokens:** ~85,000

## Prerequisites

- Phase 0 complete and approved
- Local Python 3.13 installed
- AWS SAM CLI installed
- Access to deploy to AWS

---

## Task 1: Create Python Lambda Project Structure

**Goal:** Set up the Python Lambda project with proper directory structure, dependencies, and configuration.

**Files to Create:**
- `backend/python/requirements.txt` - Python dependencies
- `backend/python/__init__.py` - Package marker
- `backend/python/index.py` - Lambda entry point (router)

**Prerequisites:**
- None (first task)

**Implementation Steps:**
1. Create the `backend/python/` directory structure as defined in Phase-0
2. Create `requirements.txt` with:
   - yfinance
   - pandas
   - boto3 (for explicit version control, though Lambda provides it)
   - Note: `requests` is available as a transitive dependency of yfinance
3. Create the Lambda entry point that routes requests to appropriate handlers based on the HTTP path
4. The router should parse `event['rawPath']` and `event['requestContext']['http']['method']` to determine which handler to invoke

**Verification Checklist:**
- [ ] `backend/python/` directory exists with proper structure
- [ ] `requirements.txt` has all required dependencies
- [ ] `index.py` has a `handler` function that accepts Lambda event/context
- [ ] Router logic handles GET /stocks, GET /search, POST /batch/stocks

**Testing Instructions:**
- Unit test: Mock event objects and verify router dispatches to correct handler stubs
- Run: `cd backend && python -m pytest python_tests/test_router.py -v`

**Commit Message Template:**
```
feat(backend): add Python Lambda project structure

Create Python Lambda foundation for yfinance integration
Add requirements.txt with yfinance, pandas dependencies
Add index.py router for /stocks, /search, /batch/stocks endpoints
```

---

## Task 2: Implement yfinance Service Layer

**Goal:** Create a wrapper service around yfinance that fetches stock data with proper error handling and retry logic.

**Files to Create:**
- `backend/python/services/__init__.py`
- `backend/python/services/yfinance_service.py`

**Prerequisites:**
- Task 1 complete

**Implementation Steps:**
1. Create the yfinance service module with functions:
   - `fetch_stock_prices(ticker, start_date, end_date)` - Returns historical OHLCV data
   - `fetch_symbol_metadata(ticker)` - Returns company info
   - `search_tickers(query)` - Returns matching tickers
2. Implement retry logic with exponential backoff (similar to current Tiingo service pattern)
3. Handle yfinance exceptions and convert to meaningful error messages
4. Use yfinance's built-in download caching for performance

**Key yfinance API patterns:**
```python
import yfinance as yf
import requests  # transitive dep from yfinance

# Historical prices
ticker = yf.Ticker("AAPL")
hist = ticker.history(start="2024-01-01", end="2024-12-31")

# Metadata
info = ticker.info  # dict with company details

# Search - use Yahoo Finance autocomplete API directly
def search_tickers(query: str) -> list:
    url = "https://query2.finance.yahoo.com/v1/finance/search"
    params = {"q": query, "quotesCount": 10, "newsCount": 0}
    response = requests.get(url, params=params)
    data = response.json()
    return data.get("quotes", [])
```

**Note:** yfinance's `yf.search()` function has inconsistent behavior across versions. Use Yahoo Finance's autocomplete API directly for reliable search.

**Verification Checklist:**
- [ ] `fetch_stock_prices` returns DataFrame with OHLCV columns
- [ ] `fetch_symbol_metadata` returns dict with name, exchange, description
- [ ] `search_tickers` returns list of matching symbols
- [ ] Errors are caught and re-raised as appropriate exceptions
- [ ] Logging statements match existing pattern

**Testing Instructions:**
- Unit tests with mocked yfinance responses
- Mock `yf.Ticker` and `yf.search` functions
- Test error scenarios (invalid ticker, network errors)
- Run: `cd backend && python -m pytest python_tests/test_yfinance_service.py -v`

**Commit Message Template:**
```
feat(backend): add yfinance service layer

Implement stock price fetching with yfinance library
Add company metadata retrieval
Add ticker search functionality
Include retry logic with exponential backoff
```

---

## Task 3: Implement Data Transform Layer

**Goal:** Create transformation functions that convert yfinance data format to match existing Tiingo response format exactly.

**Files to Create:**
- `backend/python/utils/__init__.py`
- `backend/python/utils/transform.py`
- `backend/python/types/__init__.py`
- `backend/python/types/stock_types.py`

**Prerequisites:**
- Task 2 complete

**Implementation Steps:**
1. Define TypedDict or dataclass types matching Tiingo response structures:
   - `TiingoStockPrice` (date, open, high, low, close, volume, adjOpen, adjHigh, adjLow, adjClose, adjVolume, divCash, splitFactor)
   - `TiingoSymbolMetadata` (ticker, name, exchangeCode, startDate, endDate, description)
   - `TiingoSearchResult` (ticker, name, assetType, isActive)
2. Create transform functions:
   - `transform_history_to_tiingo(df: pd.DataFrame, ticker: str) -> list[dict]`
   - `transform_info_to_metadata(info: dict, ticker: str) -> dict`
   - `transform_search_to_tiingo(results: list) -> list[dict]`
3. Handle missing fields gracefully (use defaults where yfinance doesn't provide data)

**Key transformations:**
- yfinance `Adj Close` → Tiingo `adjClose`
- yfinance doesn't provide `adjOpen`, `adjHigh`, `adjLow` → Calculate from close ratio or use OHLC values
- yfinance `Dividends` column → Tiingo `divCash`
- yfinance `Stock Splits` column → Tiingo `splitFactor`
- Dates: Convert pandas Timestamp index to ISO string format

**Verification Checklist:**
- [ ] `transform_history_to_tiingo` output matches TiingoStockPrice schema exactly
- [ ] `transform_info_to_metadata` output matches TiingoSymbolMetadata schema
- [ ] `transform_search_to_tiingo` output matches TiingoSearchResult schema
- [ ] Date format is ISO 8601 (e.g., "2025-01-15T00:00:00.000Z")
- [ ] Missing fields have sensible defaults

**Testing Instructions:**
- Create sample yfinance DataFrames and verify transformation output
- Compare against real Tiingo API responses (use fixtures)
- Run: `cd backend && python -m pytest python_tests/test_transform.py -v`

**Commit Message Template:**
```
feat(backend): add yfinance to Tiingo data transforms

Add type definitions matching Tiingo API contracts
Implement price history transformation
Implement metadata transformation
Implement search results transformation
Ensure exact field name and format compatibility
```

---

## Task 4: Implement DynamoDB Cache Repository (Python)

**Goal:** Port the DynamoDB caching logic to Python, reusing existing table schema.

**Files to Create:**
- `backend/python/repositories/__init__.py`
- `backend/python/repositories/stocks_cache.py`

**Prerequisites:**
- Task 3 complete

**Implementation Steps:**
1. Create cache repository with functions matching existing Node.js interface:
   - `get_stock(ticker, date)` - Get single cache item
   - `put_stock(item)` - Store single cache item
   - `batch_get_stocks(ticker, dates)` - Batch get by dates
   - `batch_put_stocks(items)` - Batch put items
   - `query_stocks_by_date_range(ticker, start_date, end_date)` - Range query
2. Use boto3 DynamoDB resource/client
3. Implement TTL calculation matching existing logic (90 days historical, 1 day current)
4. Handle DynamoDB exceptions appropriately

**Table schema (existing):**
- Table: `{STACK_NAME}-StocksCache`
- Partition key: `ticker` (String)
- Sort key: `date` (String)
- Attributes: `priceData`, `metadata`, `ttl`, `fetchedAt`

**Environment variable:**
- `STOCKS_CACHE_TABLE` - Table name (provided by Lambda environment)

**Verification Checklist:**
- [ ] Can read/write to DynamoDB table
- [ ] TTL calculation matches existing logic
- [ ] Batch operations handle >25 item chunking
- [ ] Range queries work correctly

**Testing Instructions:**
- Use `moto` library to mock DynamoDB
- Test CRUD operations against mock table
- Test batch operations with >25 items
- Run: `cd backend && python -m pytest python_tests/test_stocks_cache.py -v`

**Commit Message Template:**
```
feat(backend): add Python DynamoDB cache repository

Port stocks cache operations to Python
Implement get/put/batch operations
Add TTL calculation logic
Maintain compatibility with existing table schema
```

---

## Task 5: Implement Response Utilities

**Goal:** Create response formatting utilities matching existing Node.js patterns.

**Files to Create:**
- `backend/python/utils/response.py`
- `backend/python/utils/error.py`

**Prerequisites:**
- Task 3 complete

**Implementation Steps:**
1. Create `APIError` exception class with message and status_code
2. Create response helpers:
   - `success_response(data, status_code=200, extra=None)` - Format success response
   - `error_response(message, status_code=500)` - Format error response
3. Ensure response format matches existing Node.js `successResponse`/`errorResponse` exactly
4. Include `_meta` field support for cache hit information

**Expected response structure:**
```json
{
  "statusCode": 200,
  "headers": {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  },
  "body": "{\"data\": [...], \"_meta\": {...}}"
}
```

**Verification Checklist:**
- [ ] Success response matches existing format
- [ ] Error response matches existing format
- [ ] CORS headers included
- [ ] Body is JSON string (not dict)

**Testing Instructions:**
- Unit test response formatters
- Compare output against actual Node.js Lambda responses
- Run: `cd backend && python -m pytest python_tests/test_response.py -v`

**Commit Message Template:**
```
feat(backend): add Python response utilities

Add APIError exception class
Add success_response and error_response helpers
Match existing Node.js response format exactly
Include CORS headers support
```

---

## Task 6: Implement Stocks Handler

**Goal:** Create the `/stocks` endpoint handler with caching logic.

**Files to Create:**
- `backend/python/handlers/__init__.py`
- `backend/python/handlers/stocks.py`

**Prerequisites:**
- Tasks 2, 3, 4, 5 complete

**Implementation Steps:**
1. Create handler function that:
   - Parses query parameters (ticker, startDate, endDate, type)
   - Validates inputs (ticker format, date format, type value)
   - Routes to prices or metadata sub-handlers
2. Implement `handle_prices_request`:
   - Check DynamoDB cache first
   - Calculate cache hit rate (>80% threshold)
   - Fetch from yfinance on cache miss
   - Transform to Tiingo format
   - Store in cache
   - Return response with `_meta.cached` flag
3. Implement `handle_metadata_request`:
   - Fetch from yfinance
   - Transform to Tiingo format
   - Return response

**Query parameters (match existing):**
- `ticker` - Required, uppercase ticker symbol
- `startDate` - Required for prices, YYYY-MM-DD format
- `endDate` - Optional, YYYY-MM-DD format
- `type` - Optional, "prices" (default) or "metadata"

**Verification Checklist:**
- [ ] Handles all parameter combinations correctly
- [ ] Validates ticker format (alphanumeric, dots, hyphens)
- [ ] Validates date format
- [ ] Cache check logic works (>80% hit rate threshold)
- [ ] Returns data in Tiingo format
- [ ] Includes `_meta` with cache information

**Testing Instructions:**
- Mock yfinance service and cache repository
- Test valid requests return correct format
- Test validation errors return 400
- Test cache hit vs miss scenarios
- Run: `cd backend && python -m pytest python_tests/test_stocks_handler.py -v`

**Commit Message Template:**
```
feat(backend): add stocks handler with caching

Implement /stocks endpoint handler
Add price data fetching with cache
Add metadata fetching
Maintain Tiingo response format compatibility
Include cache hit rate metrics
```

---

## Task 7: Implement Search Handler

**Goal:** Create the `/search` endpoint handler.

**Files to Create:**
- `backend/python/handlers/search.py`

**Prerequisites:**
- Tasks 2, 3, 5 complete

**Implementation Steps:**
1. Create handler function that:
   - Parses `query` parameter
   - Validates query (required, max 100 characters)
   - Calls Yahoo Finance autocomplete API (via yfinance_service.search_tickers)
   - Transforms results to Tiingo format
   - Returns response
2. Handle empty results gracefully (return empty array)

**Yahoo Finance search response fields:**
- `symbol` → Tiingo `ticker`
- `shortname` → Tiingo `name`
- `quoteType` → Tiingo `assetType`
- `isActive` → default to `true` (not provided by Yahoo)

**Query parameters:**
- `query` - Required, search string

**Verification Checklist:**
- [ ] Validates query parameter presence
- [ ] Validates query length
- [ ] Returns results in Tiingo search format
- [ ] Empty results return empty array, not error

**Testing Instructions:**
- Mock yfinance search function
- Test valid searches
- Test missing query returns 400
- Test empty results
- Run: `cd backend && python -m pytest python_tests/test_search_handler.py -v`

**Commit Message Template:**
```
feat(backend): add search handler

Implement /search endpoint handler
Add query validation
Transform yfinance search results to Tiingo format
Handle empty results gracefully
```

---

## Task 8: Implement Batch Stocks Handler

**Goal:** Create the `/batch/stocks` endpoint handler.

**Files to Create:**
- `backend/python/handlers/batch.py`

**Prerequisites:**
- Task 6 complete

**Implementation Steps:**
1. Create handler function that:
   - Parses JSON body (`tickers`, `startDate`, `endDate`)
   - Validates inputs (array of tickers, max 10, date format)
   - Processes tickers in parallel using asyncio or ThreadPoolExecutor
   - Aggregates results and errors
   - Returns batch response format
2. Reuse `handle_prices_request` from stocks handler for each ticker

**Request body:**
```json
{
  "tickers": ["AAPL", "GOOGL", "MSFT"],
  "startDate": "2024-01-01",
  "endDate": "2024-12-31"
}
```

**Response format (match existing):**
```json
{
  "data": {
    "AAPL": [...],
    "GOOGL": [...]
  },
  "errors": {
    "INVALID": "Ticker not found"
  },
  "_meta": {
    "successCount": 2,
    "errorCount": 1,
    "cached": {"AAPL": true, "GOOGL": false},
    "timestamp": "..."
  }
}
```

**Verification Checklist:**
- [ ] Validates tickers array (required, non-empty, max 10)
- [ ] Validates date format
- [ ] Processes tickers in parallel
- [ ] Returns aggregated results and errors
- [ ] Response format matches existing batch endpoint
- [ ] Includes `X-Batch-Limit: 10` header

**Testing Instructions:**
- Mock stocks handler's `handle_prices_request`
- Test valid batch request
- Test >10 tickers returns 400
- Test partial failures (some tickers succeed, some fail)
- Run: `cd backend && python -m pytest python_tests/test_batch_handler.py -v`

**Commit Message Template:**
```
feat(backend): add batch stocks handler

Implement /batch/stocks endpoint handler
Add parallel ticker processing
Aggregate results and errors
Match existing batch response format
Enforce 10 ticker limit
```

---

## Task 9: Create Python Test Suite

**Goal:** Create comprehensive test suite for Python Lambda.

**Files to Create:**
- `backend/python/requirements-dev.txt` - Test dependencies
- `backend/python_tests/__init__.py`
- `backend/python_tests/conftest.py` - Shared fixtures
- `backend/python_tests/test_router.py`
- `backend/python_tests/test_yfinance_service.py`
- `backend/python_tests/test_transform.py`
- `backend/python_tests/test_stocks_cache.py`
- `backend/python_tests/test_response.py`
- `backend/python_tests/test_stocks_handler.py`
- `backend/python_tests/test_search_handler.py`
- `backend/python_tests/test_batch_handler.py`

**Prerequisites:**
- Tasks 1-8 complete

**Implementation Steps:**
1. Create `backend/python/requirements-dev.txt` with test dependencies:
   - pytest
   - pytest-mock
   - moto[dynamodb]
   - pytest-asyncio (if using async)
2. Create pytest configuration in `backend/pyproject.toml` or `backend/pytest.ini`
3. Create shared fixtures:
   - Mock yfinance ticker/search responses
   - Mock DynamoDB table (using moto)
   - Mock Lambda event objects
   - Sample Tiingo response fixtures for comparison
4. Write tests for each module as specified in previous tasks
5. Ensure all tests can run without network access (fully mocked)

**Verification Checklist:**
- [ ] All test files exist
- [ ] pytest runs successfully
- [ ] All tests pass
- [ ] Coverage >80% for handlers and services
- [ ] No network calls in tests (fully mocked)

**Testing Instructions:**
- Run full test suite: `cd backend && python -m pytest python_tests/ -v`
- Run with coverage: `cd backend && python -m pytest python_tests/ --cov=python --cov-report=html`

**Commit Message Template:**
```
test(backend): add Python Lambda test suite

Add pytest configuration
Add shared test fixtures
Add unit tests for all handlers and services
Use moto for DynamoDB mocking
Achieve >80% coverage
```

---

## Task 10: Update SAM Template for Python Lambda

**Goal:** Modify `template.yaml` to deploy Python Lambda alongside existing Node.js Lambda.

**Files to Modify:**
- `backend/template.yaml`

**Prerequisites:**
- Tasks 1-9 complete

**Implementation Steps:**
1. Add new Python Lambda function resource with explicit CodeUri:
   ```yaml
   YFinanceStocksFunction:
     Type: AWS::Serverless::Function
     Properties:
       CodeUri: python/
       Handler: index.handler
       Runtime: python3.13
       MemorySize: 512
       Timeout: 30
       Environment:
         Variables:
           STOCKS_CACHE_TABLE: !Ref StocksCacheTable
   ```
2. SAM automatically packages dependencies from `python/requirements.txt`
3. Add new API Gateway integration for Python Lambda
4. Update routing:
   - `GET /stocks` → Python Lambda
   - `GET /search` → Python Lambda
   - `POST /batch/stocks` → Python Lambda
5. Keep existing Node.js routes unchanged
6. Remove `TIINGO_API_KEY` from Node.js Lambda environment (no longer needed there)
7. Remove `CacheWarmingFunction` Lambda resource
8. Remove `TopTickersCacheTable` DynamoDB table (only used by cache warming)

**Key changes to template:**
- New `YFinanceStocksFunction` resource (Python Lambda)
- New `YFinanceIntegration` API Gateway integration
- Update route targets for stock endpoints
- Remove `CacheWarmingFunction` Lambda
- Remove `TopTickersCacheTable` DynamoDB table
- Remove `TiingoApiKey` parameter (make optional or remove entirely)

**Verification Checklist:**
- [ ] Template validates: `sam validate`
- [ ] Python Lambda resource defined correctly
- [ ] Routes point to correct Lambda functions
- [ ] Environment variables correct for each Lambda
- [ ] TIINGO_API_KEY removed from required parameters (or made optional)

**Testing Instructions:**
- Run `sam validate --template template.yaml`
- Run `sam build` to verify build succeeds
- Test locally with `sam local invoke`

**Commit Message Template:**
```
feat(backend): update SAM template for Python Lambda

Add YFinanceStocksFunction Python Lambda
Add API Gateway integration for Python Lambda
Route /stocks, /search, /batch/stocks to Python
Remove cache warming resources
Keep Node.js Lambda for news, sentiment, predict
```

---

## Task 11: Update Deploy Script

**Goal:** Modify deployment script to remove Tiingo dependency and update SAM deploy parameters.

**Files to Modify:**
- `backend/scripts/deploy.sh`

**Prerequisites:**
- Task 10 complete

**Implementation Steps:**
1. Remove TIINGO_API_KEY prompt (no longer needed)
2. Remove TIINGO_API_KEY from `.env.deploy` save logic
3. Update SAM deploy command to remove TiingoApiKey parameter
4. Keep all other existing functionality

**Note:** SAM automatically handles Python dependency packaging via `requirements.txt` in the Python code directory. No manual build steps needed.

**Verification Checklist:**
- [ ] Script runs without TIINGO_API_KEY prompt
- [ ] SAM build succeeds for both Lambdas
- [ ] SAM deploy succeeds
- [ ] Both Lambdas deploy correctly
- [ ] API Gateway routes work

**Testing Instructions:**
- Run `./scripts/deploy.sh` in test account
- Verify endpoints respond correctly
- Test `/stocks`, `/search`, `/batch/stocks`

**Commit Message Template:**
```
feat(backend): update deploy script for yfinance migration

Remove Tiingo API key prompt and config
Update SAM deploy parameters
```

---

## Task 12: Remove Tiingo Code

**Goal:** Clean up unused Tiingo integration code from Node.js Lambda.

**Files to Delete:**
- `backend/src/services/tiingo.service.ts`
- `backend/src/types/tiingo.types.ts`
- `backend/src/handlers/search.handler.ts` (moved to Python)
- `backend/src/services/cacheWarming.service.ts`
- `backend/scripts/warm-cache.ts`

**Files to Modify:**
- `backend/src/handlers/stocks.handler.ts` - Delete entirely (moved to Python)
- `backend/src/handlers/batch.handler.ts` - Remove `handleBatchStocksRequest`, keep news/sentiment
- `backend/src/index.ts` - Remove stock/search routes
- `backend/src/utils/cacheTransform.util.ts` - Remove Tiingo transforms (keep Finnhub)

**Prerequisites:**
- Tasks 10, 11 complete and tested

**Implementation Steps:**
1. Delete files listed above
2. Update `batch.handler.ts`:
   - Remove `handleBatchStocksRequest` export and function
   - Remove Tiingo-related imports
   - Keep `handleBatchNewsRequest` and `handleBatchSentimentRequest`
3. Update `index.ts` (main router):
   - Remove `/stocks` route
   - Remove `/search` route
   - Remove `/batch/stocks` route (now handled by Python)
4. Update `cacheTransform.util.ts`:
   - Remove `transformTiingoToCache` and `transformCacheToTiingo`
   - Keep Finnhub transforms
5. Clean up any unused imports across remaining files

**Verification Checklist:**
- [ ] All Tiingo files deleted
- [ ] No remaining Tiingo imports in Node.js code
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] Node.js Lambda handles only news, sentiment, predict routes

**Testing Instructions:**
- Run `npm run build` - should succeed
- Run `npm run lint` - should pass
- Run `npm test` - should pass (may need to remove Tiingo-related tests)
- Deploy and test news endpoints still work

**Commit Message Template:**
```
refactor(backend): remove Tiingo integration code

Delete tiingo.service.ts, tiingo.types.ts
Delete search.handler.ts (moved to Python)
Delete cache warming service and scripts
Update batch handler to remove stocks batch
Update router to remove stock routes
Clean up unused imports
```

---

## Task 13: Update CI Pipeline

**Goal:** Update GitHub Actions to test both Python and Node.js code.

**Files to Modify:**
- `.github/workflows/ci.yml` (or equivalent)

**Prerequisites:**
- Task 9 complete

**Implementation Steps:**
1. Add Python test job:
   - Set up Python 3.13
   - Install test dependencies
   - Run pytest with mocked dependencies
2. Keep existing Node.js test job
3. Ensure both jobs must pass for CI to succeed

**Python test job steps:**
```yaml
- uses: actions/setup-python@v5
  with:
    python-version: '3.13'
- name: Install dependencies
  run: |
    pip install -r backend/python/requirements.txt
    pip install -r backend/python/requirements-dev.txt
- name: Run Python tests
  env:
    PYTHONPATH: backend/python
  run: pytest backend/python_tests/ -v
```

**Verification Checklist:**
- [ ] CI runs Python tests
- [ ] CI runs Node.js tests
- [ ] Both test suites pass
- [ ] No live AWS/yfinance calls in CI

**Testing Instructions:**
- Push branch to GitHub
- Verify CI workflow runs
- Both Python and Node.js tests pass

**Commit Message Template:**
```
ci: add Python test job to CI pipeline

Add Python 3.13 setup step
Run pytest for Python Lambda tests
Keep existing Node.js test job
Ensure all tests use mocked dependencies
```

---

## Phase Verification

Phase 1 is complete when:

- [ ] Python Lambda handles `/stocks`, `/search`, `/batch/stocks`
- [ ] Response format identical to previous Tiingo responses
- [ ] DynamoDB caching works (same tables, same behavior)
- [ ] All Python tests pass (>80% coverage)
- [ ] All Node.js tests pass
- [ ] CI pipeline passes
- [ ] Tiingo code removed from Node.js Lambda
- [ ] Deploy script works without TIINGO_API_KEY
- [ ] Production deployment successful
- [ ] Manual testing confirms all endpoints work

**Integration Test Scenarios:**
1. `GET /stocks?ticker=AAPL&startDate=2024-01-01` returns price data
2. `GET /stocks?ticker=AAPL&type=metadata` returns company info
3. `GET /search?query=Apple` returns search results
4. `POST /batch/stocks` with multiple tickers returns aggregated data
5. Cache hit scenario (second request for same data)
6. Invalid ticker returns 404
7. Invalid date format returns 400

**Known Limitations:**
- yfinance search may return fewer/different results than Tiingo
- `startDate`/`endDate` fields in metadata will be empty (yfinance doesn't provide)
- `isActive` in search results defaults to `true` (yfinance doesn't provide)
- Adjusted OHLC values may differ slightly from Tiingo's calculation

---

## Review Feedback (Iteration 2)

### Verification Summary

**Tools Used:**
- `pytest backend/python_tests/ -v`: 71/71 tests passing
- `sam validate --template template.yaml`: Valid
- `npm run build`: Succeeds
- `npm test`: **3 test suites failing**
- `git log --oneline -5`: Commits follow conventional format

### Issues Found

#### Iteration 1 Issues - RESOLVED ✓
- ~~CacheWarmingFunction removed from template.yaml~~
- ~~TopTickersCacheTable removed from template.yaml~~
- ~~cacheWarming.service.ts deleted~~
- ~~warm-cache.ts deleted~~

#### Iteration 2 Issues - Node.js Test Cleanup

> **Consider:** Running `npm test` shows 3 failing test suites. The tests reference code that was removed:
>
> 1. `tests/backend/handlers/cacheWarming.handler.test.ts` - Imports deleted `cacheWarming.service`
> 2. `tests/backend/handlers/batch.handler.test.ts` - References removed `handleBatchStocksRequest`
> 3. `tests/backend/index.test.ts` - Tests routes that moved to Python Lambda
>
> **Think about:** When source code is deleted, what happens to the corresponding test files? Should they be deleted or updated?
>
> **Reflect:** Task 12's verification checklist says "npm test passes". What test files need to be removed or updated to satisfy this?

### What's Working Well

- Python Lambda implementation complete (all handlers, services, transforms)
- 71 Python tests passing with meaningful assertions
- CI pipeline properly updated with PYTHONPATH
- SAM template cleanup complete (cache warming removed)
- Source code cleanup complete
- Commits follow conventional format

### Remaining Work

1. Delete `tests/backend/handlers/cacheWarming.handler.test.ts`
2. Update `tests/backend/handlers/batch.handler.test.ts` - remove `handleBatchStocksRequest` tests
3. Update `tests/backend/index.test.ts` - remove/update tests for routes moved to Python

Once `npm test` passes, re-run review for approval.
