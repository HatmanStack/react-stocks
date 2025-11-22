# Phase 1: Backend Infrastructure & ML Model

## Phase Goal

Implement DynamoDB historical storage tables, frontend database schema updates (table renames + new fields), and complete TypeScript-based prediction handler for multi-signal stock prediction. This phase establishes the hybrid database architecture (DynamoDB backend + frontend cache), integrates existing Phase 5 services (eventClassification, aspectAnalysis, distilFinBERT), and builds the ML pipeline using TensorFlow.js. By the end of this phase, the prediction handler will be fully functional and tested, ready for API Gateway integration in Phase 2.

**Success Criteria**:
- DynamoDB tables created for persistent historical storage (multi-user shared)
- Frontend tables renamed and updated with new prediction fields
- Repositories updated to use new table names (`article_analysis_details`, `daily_sentiment_aggregate`)
- Prediction handler (`prediction.handler.ts`) integrates Phase 5 services
- TensorFlow.js logistic regression trains on-the-fly and generates predictions
- Unit tests achieve 80%+ coverage (Jest for TypeScript)
- Integration tests verify data flow with mocked DynamoDB

**Estimated Tokens**: ~105,000

---

## Prerequisites

### Completed Dependencies
- Phase 0 read and understood
- Development environment configured (Node v24, TypeScript, AWS CLI, SAM CLI)
- **Phase 5 services already implemented** (eventClassification, aspectAnalysis, distilFinBERT)
  - Located in: `backend/src/services/`
  - Status: Written but untested (this plan adds comprehensive tests)

### External Dependencies to Verify
- Existing ReactStocksFunction Lambda operational
- Backend API Gateway accessible (`EXPO_PUBLIC_BACKEND_URL`)
- Expo SQLite and localStorage database implementations working
- TensorFlow.js compatible with Lambda environment (Node.js 20)

### Environment Requirements
- `.env` file with `EXPO_PUBLIC_BACKEND_URL` configured
- AWS credentials configured locally (DynamoDB access for testing)
- Node.js 20 with TypeScript support

---

## Implementation Guide Reference

**IMPORTANT**: Many tasks in this phase require converting Python/scikit-learn patterns to TypeScript/TensorFlow.js.

📘 **See**: [Python to TypeScript Conversion Guide](./PYTHON_TO_TYPESCRIPT_GUIDE.md)

This comprehensive guide covers:
- Language syntax differences (Python → TypeScript)
- NumPy → TensorFlow.js tensor operations
- scikit-learn → TensorFlow.js ML models
- pytest → Jest testing patterns
- Complete code examples and best practices

**When to use the guide**:
- Tasks involving feature engineering (arrays, math operations)
- Tasks involving ML models (logistic regression)
- Tasks involving normalization/scaling
- Any task marked "NEEDS REWRITE" in PLAN_UPDATES_STATUS.md

**Pattern to follow**:
1. Read the task requirements
2. Consult the conversion guide for syntax/library equivalents
3. Reference existing backend handlers (`sentiment.handler.ts`, `stocks.handler.ts`) for architectural patterns
4. Implement using TypeScript/TensorFlow.js
5. Test with Jest (not pytest)

---

## Tasks

### Task 1: Create DynamoDB Historical Storage Tables

**Goal**: Create three new DynamoDB tables for persistent multi-user historical data storage: `StockHistoricalData`, `ArticleAnalysisData`, and `DailySentimentAggregate`. These tables enable cross-user caching and incremental date range appending.

**Files to Modify/Create**:
- `backend/template.yaml` - Add DynamoDB table definitions
- `backend/src/types/dynamodb.types.ts` - TypeScript interfaces for DynamoDB items
- `backend/src/services/dynamodb.client.ts` - DynamoDB client wrapper
- `__tests__/backend/services/dynamodb.client.test.ts` - Unit tests

**Prerequisites**:
- Understanding of DynamoDB table design (partition key + sort key)
- Familiarity with SAM template DynamoDB resources
- Knowledge of AWS SDK v3 DynamoDB operations

**Implementation Steps**:
1. Update `backend/template.yaml` with three new table resources:
   - **StockHistoricalData**:
     - PartitionKey: `ticker` (STRING)
     - SortKey: `date` (STRING, ISO 8601)
     - Attributes: OHLCV, marketCap, ratios
     - BillingMode: PAY_PER_REQUEST (or provisioned with auto-scaling)
   - **ArticleAnalysisData**:
     - PartitionKey: `ticker` (STRING)
     - SortKey: `articleHash#date` (STRING, composite)
     - Attributes: eventType, aspectScore, distilFinBERTScore, materialityScore
     - GSI (optional): date-based queries
   - **DailySentimentAggregate**:
     - PartitionKey: `ticker` (STRING)
     - SortKey: `date` (STRING)
     - Attributes: eventCounts, avgAspectScore, avgFinBERTScore, prediction fields
2. Add table name environment variables to Lambda function config
3. Create TypeScript interfaces in `dynamodb.types.ts`:
   - `StockHistoricalDataItem`, `ArticleAnalysisDataItem`, `DailySentimentAggregateItem`
4. Create DynamoDB client wrapper with type-safe methods:
   - `putStockData()`, `getStockData()`, `queryStockDataByDateRange()`
   - `putArticleAnalysis()`, `queryArticlesByTicker()`
   - `putDailySentiment()`, `getDailySentiment()`
5. Write unit tests with mocked DynamoDB client

**Verification Checklist**:
- [ ] SAM template validates (`sam validate`)
- [ ] Three DynamoDB tables defined in template
- [ ] Environment variables configured for table names
- [ ] TypeScript interfaces match DynamoDB schema
- [ ] DynamoDB client wrapper implements CRUD operations
- [ ] Unit tests mock DynamoDB operations (no real AWS calls)
- [ ] Tests verify type safety and error handling

**Testing Instructions**:
- Unit test: DynamoDB client wrapper methods
- Unit test: putStockData and getStockData operations
- Unit test: Query operations with date ranges
- Unit test: Error handling (table not found, validation errors)
- Run: `npm test -- dynamodb.client.test.ts`
- Validate: `cd backend && sam validate`

**Commit Message Template**:
```
Author & Commiter : HatmanStack
Email : 82614182+HatmanStack@users.noreply.github.com

feat(backend): create DynamoDB tables for historical data storage

- Add StockHistoricalData table (ticker + date keys)
- Add ArticleAnalysisData table (ticker + articleHash#date keys)
- Add DailySentimentAggregate table (ticker + date keys)
- Create TypeScript interfaces for DynamoDB items
- Implement DynamoDB client wrapper with type-safe methods
- Add unit tests with mocked AWS SDK
```

---

### Task 2: Database Schema Migration - Update Prediction Fields

**Goal**: Replace single-value prediction fields (`nextDay`, `twoWks`, `oneMnth`) with structured direction + probability fields in both `combined_word_count_details` and `portfolio_details` tables. This enables storing binary classification results (up/down) with confidence scores.

**Files to Modify/Create**:
- `src/database/schema.ts` - Add migration SQL for prediction fields
- `src/database/database.ts` - Execute migration (SQLite)
- `src/database/database.web.ts` - Update localStorage schema
- `src/types/database.types.ts` - Update `CombinedWordDetails` and `PortfolioDetails` interfaces
- `__tests__/database/migrations/prediction_fields_migration.test.ts` - Test migration

**Prerequisites**:
- Task 1 completed
- Understanding of prediction format (direction: 'up' | 'down', probability: 0-1)

**Implementation Steps**:
1. Create migration constant `MIGRATE_PREDICTION_FORMAT_FIELDS` in `schema.ts`
2. For `combined_word_count_details`, add six new columns:
   - `nextDayDirection TEXT` (values: 'up' or 'down')
   - `nextDayProbability REAL` (range 0-1)
   - `twoWeekDirection TEXT`
   - `twoWeekProbability REAL`
   - `oneMonthDirection TEXT`
   - `oneMonthProbability REAL`
3. For `portfolio_details`, add same six columns
4. Keep legacy fields (`nextDay`, `twoWks`, `oneMnth`) for backward compatibility
5. Update TypeScript interfaces:
   - Mark old fields as deprecated (`@deprecated`)
   - Add new fields with proper types
6. Update localStorage schema to store new fields
7. Write migration test covering:
   - Migration execution
   - Column existence and types
   - Valid value constraints
   - Backward compatibility (legacy fields still work)

**Verification Checklist**:
- [ ] Migration runs successfully on both tables
- [ ] New direction fields only accept 'up' or 'down' (or NULL)
- [ ] New probability fields accept 0-1 range (or NULL)
- [ ] Legacy prediction fields remain functional
- [ ] TypeScript interfaces reflect schema changes
- [ ] localStorage implementation supports new format
- [ ] Tests pass for both SQLite and localStorage

**Testing Instructions**:
- Unit test: Migration execution on both tables
- Unit test: Data type validation (TEXT, REAL)
- Unit test: Valid value constraints (direction enum, probability range)
- Unit test: Backward compatibility (old fields readable)
- Run: `npm test -- prediction_fields_migration.test.ts`

**Commit Message Template**:
```
Author & Commiter : HatmanStack
Email : 82614182+HatmanStack@users.noreply.github.com

feat(schema): add structured prediction fields for direction and probability

- Add nextDayDirection, nextDayProbability to combined_word_count_details
- Add twoWeekDirection, twoWeekProbability to combined_word_count_details
- Add oneMonthDirection, oneMonthProbability to combined_word_count_details
- Add same six fields to portfolio_details table
- Deprecate legacy single-value prediction fields
- Maintain backward compatibility during migration
```

---

### Task 3: Repository Layer Updates

**Goal**: Update repository methods in `word_count.repository.ts`, `combined_word_count.repository.ts`, and `portfolio.repository.ts` to handle new schema fields. Ensure both SQLite and localStorage implementations work correctly with the updated schema.

**Files to Modify/Create**:
- `src/database/repositories/word_count.repository.ts` - Add new fields to insert/query
- `src/database/repositories/combined_word_count.repository.ts` - Update prediction field handling
- `src/database/repositories/portfolio.repository.ts` - Update prediction field handling
- `__tests__/database/repositories/word_count.repository.test.ts` - Test new fields
- `__tests__/database/repositories/combined_word_count.repository.test.ts` - Test prediction updates
- `__tests__/database/repositories/portfolio.repository.test.ts` - Test prediction updates

**Prerequisites**:
- Task 1 and Task 2 completed (migrations run successfully)
- Understanding of repository pattern (see existing repositories)
- Familiarity with prepared SQL statements

**Implementation Steps**:
1. **word_count.repository.ts**:
   - Update `insert()` to accept and store new fields (eventType, aspectScore, distilFinBERTScore, materialityScore)
   - Update `findByTicker()` to SELECT new fields
   - Update `findByHash()` to SELECT new fields
   - Ensure platform-specific code paths handle both SQLite and localStorage
2. **combined_word_count.repository.ts**:
   - Update `insert()` to accept new prediction format (6 fields)
   - Update `findByTicker()` to SELECT and return new fields
   - Add helper to map legacy fields to new format (for backward compatibility)
   - Update transaction logic if needed
3. **portfolio.repository.ts**:
   - Update `insert()` and `update()` for new prediction fields
   - Update `findAll()` to SELECT new fields
   - Ensure prediction format matches combined_word_count pattern
4. Write comprehensive repository tests:
   - Test insert with new fields (valid values)
   - Test insert with null values (optional fields)
   - Test query returns new fields correctly
   - Test backward compatibility (old data still readable)
   - Test both SQLite and localStorage code paths

**Verification Checklist**:
- [x] Insert operations accept all new fields
- [x] Query operations return all new fields
- [x] Null values handled gracefully
- [x] Type safety enforced (TypeScript validates field types)
- [x] Platform-specific code (SQLite vs localStorage) works correctly
- [x] Existing data (without new fields) still readable
- [x] Tests cover happy path and edge cases
- [x] Tests pass on both SQLite and localStorage mocks

**Testing Instructions**:
- Unit test: Insert with all new fields populated
- Unit test: Insert with null/undefined new fields
- Unit test: Query returns correct data types
- Unit test: Backward compatibility with legacy data
- Integration test: End-to-end insert → query flow
- Run: `npm test -- repositories/`

**Commit Message Template**:
```
Author & Commiter : HatmanStack
Email : 82614182+HatmanStack@users.noreply.github.com

feat(repositories): update repositories for new prediction schema

- Add event and sentiment field support to word_count.repository
- Update prediction format handling in combined_word_count.repository
- Update prediction format handling in portfolio.repository
- Maintain backward compatibility with legacy data
- Add comprehensive unit tests for new field operations
```

---

### Task 4: Prediction Handler Setup and Route Configuration

**Goal**: Add prediction handler to existing ReactStocksFunction Lambda following the established backend pattern. Configure TypeScript dependencies and add `/predict` route to API Gateway.

**Files to Modify/Create**:
- `backend/src/handlers/prediction.handler.ts` - New prediction handler (TypeScript)
- `backend/src/index.ts` - Add route mapping for /predict
- `backend/src/types/prediction.types.ts` - Request/response types
- `backend/package.json` - Add TensorFlow.js dependency
- `backend/template.yaml` - Add /predict API route
- `__tests__/backend/handlers/prediction.handler.test.ts` - Handler tests

**Prerequisites**:
- Task 3 completed (repository layer ready)
- Understanding of existing handler pattern (see `sentiment.handler.ts`)
- Familiarity with SAM API Gateway route configuration

**Implementation Steps**:

1. **Install TensorFlow.js** in backend:
   ```bash
   cd backend
   npm install --save @tensorflow/tfjs-node
   ```

2. **Create type definitions** in `types/prediction.types.ts`:
   ```typescript
   export interface PredictionRequest {
       ticker: string;
       days: number;
   }

   export interface PredictionResponse {
       ticker: string;
       predictions: {
           nextDay: { direction: 'up' | 'down'; probability: number };
           twoWeek: { direction: 'up' | 'down'; probability: number };
           oneMonth: { direction: 'up' | 'down'; probability: number };
       };
   }

   export const MODEL_CONFIG = {
       inputDim: 14,
       learningRate: 0.01,
       epochs: 100,
       batchSize: 32,
       validationSplit: 0.2,
       horizons: [1, 14, 30],
       labelThreshold: 0.01  // ±1%
   } as const;
   ```

3. **Create minimal handler** `handlers/prediction.handler.ts`:
   ```typescript
   import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
   import { PredictionRequest, PredictionResponse } from '../types/prediction.types';

   export async function predictionHandler(
       event: APIGatewayProxyEvent
   ): Promise<APIGatewayProxyResult> {
       console.log('[PredictionHandler] Request received:', event.body);

       try {
           // Parse request
           const request: PredictionRequest = JSON.parse(event.body || '{}');

           // Validate
           if (!request.ticker || !request.days || request.days < 30) {
               return {
                   statusCode: 400,
                   body: JSON.stringify({ error: 'Invalid request' })
               };
           }

           // TODO: Implement prediction logic (Tasks 5-11)
           const response: PredictionResponse = {
               ticker: request.ticker,
               predictions: {
                   nextDay: { direction: 'up', probability: 0.5 },
                   twoWeek: { direction: 'up', probability: 0.5 },
                   oneMonth: { direction: 'down', probability: 0.5 }
               }
           };

           return {
               statusCode: 200,
               headers: {
                   'Content-Type': 'application/json',
                   'Access-Control-Allow-Origin': '*'
               },
               body: JSON.stringify(response)
           };
       } catch (error) {
           console.error('[PredictionHandler] Error:', error);
           return {
               statusCode: 500,
               body: JSON.stringify({ error: 'Internal server error' })
           };
       }
   }
   ```

4. **Update route mapping** in `index.ts`:
   ```typescript
   import { predictionHandler } from './handlers/prediction.handler';

   export const handler = async (event: APIGatewayProxyEvent) => {
       const path = event.requestContext.http.path;

       switch (path) {
           case '/stocks':
               return stocksHandler(event);
           case '/news':
               return newsHandler(event);
           case '/sentiment':
               return sentimentHandler(event);
           case '/predict':  // NEW
               return predictionHandler(event);
           default:
               return { statusCode: 404, body: 'Not Found' };
       }
   };
   ```

5. **Update SAM template** `template.yaml`:
   - Add new HttpApi event to ReactStocksFunction:
     ```yaml
     PredictApi:
       Type: HttpApi
       Properties:
         ApiId: !Ref ReactStocksApi
         Path: /predict
         Method: POST
     ```
   - **NO new Lambda function** (reuses existing ReactStocksFunction)

6. **Write handler test**:
   ```typescript
   import { predictionHandler } from '../../../src/handlers/prediction.handler';
   import { APIGatewayProxyEvent } from 'aws-lambda';

   describe('predictionHandler', () => {
       it('should return 400 for invalid request', async () => {
           const event = {
               body: JSON.stringify({ ticker: 'AAPL' })  // Missing days
           } as APIGatewayProxyEvent;

           const response = await predictionHandler(event);

           expect(response.statusCode).toBe(400);
       });

       it('should return 200 with valid request', async () => {
           const event = {
               body: JSON.stringify({ ticker: 'AAPL', days: 30 })
           } as APIGatewayProxyEvent;

           const response = await predictionHandler(event);

           expect(response.statusCode).toBe(200);
           const body = JSON.parse(response.body);
           expect(body.ticker).toBe('AAPL');
           expect(body.predictions).toBeDefined();
       });
   });
   ```

**Verification Checklist**:
- [x] TensorFlow.js added to package.json
- [x] prediction.handler.ts follows existing handler pattern
- [x] Type definitions created in types/ directory
- [x] Route mapping added to index.ts
- [x] SAM template adds /predict route (NOT new Lambda)
- [x] Handler compiles without TypeScript errors
- [x] Jest tests pass
- [x] SAM validates: `sam validate`

**Testing Instructions**:
- Unit test: Handler with valid request
- Unit test: Handler with invalid request (missing fields)
- Unit test: Handler error handling
- Integration test: SAM build succeeds
- Run: `npm test -- prediction.handler.test.ts`
- Build: `cd backend && sam build`

**Commit Message Template**:
```
Author & Commiter : HatmanStack
Email : 82614182+HatmanStack@users.noreply.github.com

feat(handlers): add prediction handler with /predict route

- Create prediction.handler.ts following existing pattern
- Add PredictionRequest and PredictionResponse types
- Define MODEL_CONFIG constants in types file
- Add /predict route mapping to index.ts
- Update SAM template with HttpApi event for /predict
- Add TensorFlow.js to package.json dependencies
- Write Jest unit tests for handler validation
```

---

### Task 5: Data Fetching Layer - Historical Data Retrieval

**Goal**: Implement functions to fetch historical stock price data, news articles, sentiment scores, event classifications, and aspect scores from the backend database (DynamoDB/RDS). This layer provides raw data to the feature engineering pipeline.

**Files to Modify/Create**:
- `backend/src/dataFetcher.ts` - Data fetching module
- `backend/src/types/prediction.types.ts` - Data models (Pydantic or dataclasses)
- `__tests__/backend/services/test_dataFetcher.ts` - Unit tests

**Prerequisites**:
- Task 4 completed (Lambda structure ready)
- Understanding that prediction Lambda is **invoked BY sentiment Lambda** after aspect/sentiment processing completes
- Backend database (DynamoDB/RDS) contains completed sentiment and aspect data

**Implementation Steps**:
1. Create `types/prediction.types.ts` with data classes:
   - `StockPrice` (date, open, high, low, close, volume)
   - `NewsArticle` (hash, date, ticker, title, etc.)
   - `ArticleSentiment` (hash, date, eventType, aspectScore, distilFinBERTScore, materialityScore)
   - `HistoricalData` (aggregate container for all fetched data)
2. Create `dataFetcher.ts` with functions:
   - `fetch_price_data(ticker: str, start_date: str, end_date: str) -> List[StockPrice]`
     - Use boto3 to query DynamoDB (or appropriate DB client for RDS)
     - Query stock_details table with ticker + date range filter
     - Return OHLCV data sorted by date
   - `fetch_sentiment_data(ticker: str, start_date: str, end_date: str) -> List[ArticleSentiment]`
     - Use boto3 to query word_count_details table (with new fields)
     - Return per-article sentiment with event type, aspect, FinBERT scores
     - Include materiality scores for weighting
     - **Note**: This data is already complete (populated by sentiment Lambda before prediction invocation)
   - `fetch_historical_data(ticker: str, days: int) -> HistoricalData`
     - Calculate start_date from days parameter
     - Call fetch_price_data and fetch_sentiment_data
     - Combine into HistoricalData object
     - Validate minimum data requirements (30 days)
3. Configure database access:
   - Use environment variables for table names (DynamoDB) or connection strings (RDS)
   - Ensure IAM role has read permissions (configured in SAM template)
   - Handle boto3 client initialization
4. Implement error handling:
   - Raise exception if insufficient data (<30 days)
   - Log warnings for missing fields (null values)
   - Handle database connection errors gracefully
5. Write unit tests with mocked boto3:
   - Mock boto3 DynamoDB client
   - Test fetch_price_data returns correct structure
   - Test fetch_sentiment_data includes new fields
   - Test fetch_historical_data validates minimum days
   - Test error handling for missing data

**Verification Checklist**:
- [ ] Data models defined with proper types
- [ ] boto3 client configured for DynamoDB/RDS access
- [ ] Fetch functions return correct data structures
- [ ] Minimum 30-day validation enforced
- [ ] Environment variables used for table names/connections
- [ ] IAM permissions noted for SAM template configuration
- [ ] Error handling for database failures
- [ ] Logging configured for debugging
- [ ] Unit tests cover happy path and errors
- [ ] boto3 mocked correctly (no real AWS calls in tests)

**Testing Instructions**:
- Unit test: Fetch price data (mocked boto3 DynamoDB)
- Unit test: Fetch sentiment data with new fields (mocked boto3)
- Unit test: Validate minimum days requirement
- Unit test: Handle missing data and connection errors gracefully
- Run: `npm test -- backend/__tests__/prediction/test_dataFetcher.ts`

**Commit Message Template**:
```
Author & Commiter : HatmanStack
Email : 82614182+HatmanStack@users.noreply.github.com

feat(prediction): implement historical data fetching layer

- Add data models for price, sentiment, and historical data
- Implement fetch_price_data for OHLCV retrieval
- Implement fetch_sentiment_data with event/aspect/FinBERT scores
- Add fetch_historical_data with 30-day minimum validation
- Include comprehensive error handling and logging
```

---

### Task 6: Feature Engineering - Daily Aggregation with Materiality Weighting

**Goal**: Implement the core feature engineering pipeline that aggregates per-article data to daily level using materiality score weighting. This produces the training dataset for the logistic regression model.

**Files to Modify/Create**:
- `backend/src/featureEngineering.ts` - Feature engineering module
- `backend/src/types/prediction.types.ts` - Add `DailyFeatures` model
- `__tests__/backend/services/test_featureEngineering.ts` - Unit tests

**Prerequisites**:
- Task 5 completed (data fetching works)
- Understanding of materiality weighting logic (Phase 0, ADR-3)
- Knowledge of one-hot encoding for categorical variables

**Implementation Steps**:
1. Update `types/prediction.types.ts` with `DailyFeatures` class:
   - `date: str`
   - `ticker: str`
   - `open, high, low, close, volume: float` (price features)
   - `event_earnings, event_ma, event_guidance, event_analyst, event_product, event_general: float` (one-hot weighted)
   - `aspect_score: float` (weighted average)
   - `finbert_score: float` (weighted average)
   - `label: Optional[int]` (0=down, 1=up, None=excluded)
2. Create `featureEngineering.ts` with functions:
   - `aggregate_daily_features(price_data: List[StockPrice], sentiment_data: List[ArticleSentiment]) -> List[DailyFeatures]`
     - Group articles by date
     - For each date with articles:
       - Compute weighted average aspect score (using materiality weights)
       - Compute weighted average FinBERT score (using materiality weights)
       - Compute weighted sum for each event type (one-hot → weighted aggregation)
       - Attach corresponding price data (OHLCV)
     - Return list of daily feature rows
   - `compute_materiality_weighted_avg(values: List[float], weights: List[float]) -> float`
     - Calculate: Σ(value * weight) / Σ(weight)
     - Handle edge case: zero total weight (return 0.0 or null)
   - `compute_event_one_hot_weighted(articles: List[ArticleSentiment], weights: List[float]) -> dict`
     - For each event type, sum weights where article.eventType matches
     - Return dict with 6 event features
3. Implement edge case handling:
   - Days with no news: Skip (no features generated)
   - Null aspect scores: Treat as 0 in weighted average
   - Null FinBERT scores: Treat as 0 (non-material events)
   - Zero materiality weight: Use 0.01 minimum to avoid division by zero
4. Write comprehensive unit tests:
   - Test single article aggregation (weights = materiality score)
   - Test multiple articles with different weights
   - Test event one-hot aggregation (multiple event types same day)
   - Test weighted averages (aspect, FinBERT)
   - Test edge cases (null values, zero weights, no articles)

**Verification Checklist**:
- [ ] Daily features contain all 13 input features (OHLCV + events + aspect + FinBERT)
- [ ] Materiality weighting formula matches ADR-3
- [ ] One-hot encoding produces 6 event features
- [ ] Weighted averages mathematically correct
- [ ] Edge cases handled gracefully (nulls, zeros)
- [ ] Output format matches DailyFeatures model
- [ ] Unit tests achieve 90%+ coverage

**Testing Instructions**:
- Unit test: Single article → daily features
- Unit test: Multiple articles → weighted aggregation
- Unit test: Event one-hot encoding with mixed events
- Unit test: Null value handling
- Unit test: Zero weight edge case
- Run: `npm test -- backend/__tests__/prediction/test_featureEngineering.ts -v`

**Commit Message Template**:
```
Author & Commiter : HatmanStack
Email : 82614182+HatmanStack@users.noreply.github.com

feat(prediction): implement daily feature aggregation with materiality weighting

- Add DailyFeatures model for training dataset
- Implement aggregate_daily_features with weighted averages
- Add compute_materiality_weighted_avg for aspect/FinBERT scores
- Implement event one-hot encoding with weighted sums
- Handle null values and edge cases gracefully
```

---

### Task 7: Label Generation - Same-Day Price Movement Classification

**Goal**: Implement label generation logic that classifies each historical day as "up" (1) or "down" (0) based on same-day price movement, using a ±1% threshold to filter noise.

**Files to Modify/Create**:
- `backend/src/featureEngineering.ts` - Add label generation function
- `__tests__/backend/services/test_featureEngineering.ts` - Add label tests

**Prerequisites**:
- Task 6 completed (daily features generated)
- Understanding of labeling strategy (Phase 0, ADR-4)

**Implementation Steps**:
1. Add function to `featureEngineering.ts`:
   - `generate_label(previous_close: float, current_close: float, threshold: float = 0.01) -> Optional[int]`
     - Calculate: `price_change = (current_close - previous_close) / previous_close`
     - If `price_change > threshold`: return 1 (up)
     - Else if `price_change < -threshold`: return 0 (down)
     - Else: return None (exclude from training - noise)
2. Update `aggregate_daily_features()` to include label generation:
   - For each daily feature row, look up previous day's close price
   - Call `generate_label(previous_close, current_close)`
   - Attach label to `DailyFeatures.label`
   - Skip days where label is None (noise exclusion)
3. Handle edge cases:
   - First day has no previous close: label = None (exclude)
   - Missing price data: label = None (exclude)
   - Zero or negative prices: raise validation error
4. Write unit tests:
   - Test upward movement >1% → label=1
   - Test downward movement <-1% → label=0
   - Test small movement ±0.5% → label=None
   - Test exact threshold boundary (1.0%) → label=1
   - Test negative threshold boundary (-1.0%) → label=0
   - Test first day (no previous close) → label=None

**Verification Checklist**:
- [ ] Label generation uses previous_close → current_close calculation
- [ ] Threshold of ±1% correctly applied
- [ ] Noise range (-1% to +1%) excluded (label=None)
- [ ] First day of data excluded (no previous close)
- [ ] Invalid data raises errors (negative prices)
- [ ] Unit tests cover all boundary conditions
- [ ] Label distribution logged (% up, % down, % excluded)

**Testing Instructions**:
- Unit test: Upward movement exceeds threshold
- Unit test: Downward movement exceeds threshold
- Unit test: Movement within noise range
- Unit test: Boundary conditions (exactly ±1%)
- Unit test: Edge cases (first day, missing data)
- Run: `npm test -- backend/__tests__/prediction/test_featureEngineering.ts::test_generate_label -v`

**Commit Message Template**:
```
Author & Commiter : HatmanStack
Email : 82614182+HatmanStack@users.noreply.github.com

feat(prediction): implement same-day label generation with ±1% threshold

- Add generate_label function for binary classification
- Integrate label generation into daily feature aggregation
- Exclude noise range (-1% to +1%) from training set
- Handle edge cases (first day, missing data)
- Add comprehensive unit tests for boundary conditions
```

---

### Task 8: Feature Normalization and Preprocessing

**Goal**: Implement feature scaling/normalization using scikit-learn's StandardScaler to ensure all features are on comparable scales before training. This improves logistic regression convergence and performance.

**Files to Modify/Create**:
- `backend/src/preprocessing.ts` - Preprocessing module
- `__tests__/backend/services/test_preprocessing.ts` - Unit tests

**Prerequisites**:
- Task 7 completed (labeled daily features available)
- Understanding of feature scaling (StandardScaler: mean=0, std=1)

**Implementation Steps**:
1. Create `preprocessing.ts` with functions:
   - `prepare_training_data(daily_features: List[DailyFeatures]) -> Tuple[np.ndarray, np.ndarray]`
     - Extract feature matrix X (13 features: OHLCV + events + aspect + FinBERT, excluding horizon)
     - Extract label vector y (0 or 1)
     - Filter out rows where label is None
     - Return (X, y) as numpy arrays
   - `create_scaler(X: np.ndarray) -> StandardScaler`
     - Fit StandardScaler on training data
     - Return fitted scaler object
   - `normalize_features(X: np.ndarray, scaler: StandardScaler) -> np.ndarray`
     - Transform features using scaler
     - Return normalized X
2. Implement feature extraction:
   - Define feature order (important for consistency):
     1. open, high, low, close, volume (5 features)
     2. event_earnings, event_ma, event_guidance, event_analyst, event_product, event_general (6 features)
     3. aspect_score (1 feature)
     4. finbert_score (1 feature)
   - Extract features in this exact order for every row
3. Handle edge cases:
   - Zero variance features (all same value): StandardScaler handles this (std=1)
   - Missing labels: Filter out before creating X, y
   - NaN values: Raise error (should not occur if Task 6 handled nulls)
4. Write unit tests:
   - Test prepare_training_data extracts correct shape (N x 13)
   - Test labels extracted correctly (binary 0/1)
   - Test rows with None labels excluded
   - Test scaler fitting and transformation
   - Test normalized features have mean~0, std~1

**Verification Checklist**:
- [ ] Feature matrix shape is (num_samples, 13)
- [ ] Label vector shape is (num_samples,)
- [ ] Rows with None labels excluded
- [ ] StandardScaler fitted on training data
- [ ] Normalized features have mean≈0, std≈1
- [ ] Feature order consistent and documented
- [ ] Unit tests verify correct extraction and scaling

**Testing Instructions**:
- Unit test: Extract features from DailyFeatures list
- Unit test: Filter None labels correctly
- Unit test: Scaler normalization (mean, std)
- Unit test: Feature matrix dimensions
- Run: `npm test -- backend/__tests__/prediction/test_preprocessing.ts -v`

**Commit Message Template**:
```
Author & Commiter : HatmanStack
Email : 82614182+HatmanStack@users.noreply.github.com

feat(prediction): implement feature normalization with StandardScaler

- Add prepare_training_data to extract feature matrix and labels
- Create create_scaler and normalize_features functions
- Define consistent feature order (OHLCV, events, aspect, FinBERT)
- Filter out training examples with None labels
- Add unit tests for extraction and normalization
```

---

### Task 9: TensorFlow.js Logistic Regression Model Training ⭐ CRITICAL EXAMPLE

**Goal**: Implement the core ML training logic using TensorFlow.js sequential model with sigmoid activation (logistic regression). Train the model on normalized tensors and historical labels, then validate predictions work correctly.

**🔗 Reference**: See [Conversion Guide](./PYTHON_TO_TYPESCRIPT_GUIDE.md#scikit-learn--tensorflowjs) for detailed scikit-learn → TensorFlow.js patterns.

**Files to Modify/Create**:
- `backend/src/services/mlModel.ts` - Model training module (TypeScript)
- `backend/src/types/prediction.types.ts` - Type definitions
- `__tests__/backend/services/mlModel.test.ts` - Unit tests (Jest)
- `backend/package.json` - Add `@tensorflow/tfjs-node` dependency

**Prerequisites**:
- Task 8 completed (normalized features ready as tensors)
- TensorFlow.js installed: `npm install @tensorflow/tfjs-node`
- Understanding of TensorFlow.js Sequential API
- Knowledge of tensor memory management (`tf.tidy()`, `dispose()`)

**Implementation Steps**:

1. **Install TensorFlow.js** (if not already):
   ```bash
   cd backend
   npm install --save @tensorflow/tfjs-node
   ```

2. **Create type definitions** in `prediction.types.ts`:
   ```typescript
   export interface ModelTrainingConfig {
       inputDim: number;
       learningRate: number;
       epochs: number;
       batchSize: number;
       validationSplit: number;
   }

   export interface TrainingMetrics {
       accuracy: number;
       loss: number;
       epochs: number;
   }
   ```

3. **Create `mlModel.ts`** with functions:

   **`createLogisticRegressionModel(inputDim: number): tf.Sequential`**
   - Create sequential model with single dense layer:
     ```typescript
     const model = tf.sequential({
         layers: [
             tf.layers.dense({
                 inputShape: [inputDim],  // 14 features
                 units: 1,
                 activation: 'sigmoid',
                 kernelInitializer: 'glorotUniform'
             })
         ]
     });
     ```
   - Compile with binary cross-entropy loss:
     ```typescript
     model.compile({
         optimizer: tf.train.adam(0.01),  // Learning rate
         loss: 'binaryCrossentropy',
         metrics: ['accuracy']
     });
     ```
   - Return compiled model

   **`trainModel(X: tf.Tensor2D, y: tf.Tensor2D, config: ModelTrainingConfig): Promise<{ model: tf.Sequential, metrics: TrainingMetrics }>`**
   - Validate inputs (shape checks, min samples)
   - Calculate class weights for balanced training:
     ```typescript
     const yArray = await y.array();
     const classWeights = calculateClassWeights(yArray.flat());
     ```
   - Train model with configuration:
     ```typescript
     const history = await model.fit(X, y, {
         epochs: config.epochs,
         batchSize: config.batchSize,
         validationSplit: config.validationSplit,
         classWeight: classWeights,
         verbose: 0,
         callbacks: {
             onEpochEnd: (epoch, logs) => {
                 if (epoch % 10 === 0) {
                     console.log(`Epoch ${epoch}: loss=${logs?.loss}, acc=${logs?.acc}`);
                 }
             }
         }
     });
     ```
   - Extract final metrics from history
   - Return model and metrics

   **`calculateClassWeights(labels: number[]): { 0: number; 1: number }`**
   - Count occurrences of each class (0 and 1)
   - Calculate balanced weights:
     ```typescript
     const total = labels.length;
     const count0 = labels.filter(l => l === 0).length;
     const count1 = labels.filter(l => l === 1).length;

     return {
         0: total / (2 * count0),
         1: total / (2 * count1)
     };
     ```

   **`validateModel(model: tf.Sequential, X: tf.Tensor2D, y: tf.Tensor2D): Promise<TrainingMetrics>`**
   - Evaluate model on data:
     ```typescript
     const evaluation = model.evaluate(X, y) as tf.Scalar[];
     const loss = await evaluation[0].data();
     const accuracy = await evaluation[1].data();
     ```
   - Log metrics to CloudWatch
   - Warn if accuracy < 50%
   - Return metrics object
   - Clean up tensors: `evaluation.forEach(t => t.dispose())`

4. **Memory Management** (CRITICAL):
   - Use `tf.tidy()` to auto-dispose intermediate tensors:
     ```typescript
     const result = tf.tidy(() => {
         const normalized = X.sub(mean).div(std);
         return normalized;
     });
     ```
   - Manually dispose tensors that escape scope
   - Check memory usage: `console.log(tf.memory())`

5. **Error Handling**:
   - Insufficient data (<10 samples): throw `Error('Insufficient training data')`
   - Invalid shapes (X.shape[0] !== y.shape[0]): throw `Error('Shape mismatch')`
   - Single class detected: Log warning, attempt training anyway
   - NaN values in data: throw `Error('Invalid data contains NaN')`

6. **Write Jest unit tests**:
   ```typescript
   describe('mlModel', () => {
       describe('trainModel', () => {
           it('should train model with valid synthetic data', async () => {
               const X = tf.tensor2d([[1, 0], [0, 1], [1, 1], [0, 0]]);
               const y = tf.tensor2d([[1], [1], [0], [0]]);
               const config = {
                   inputDim: 2,
                   learningRate: 0.01,
                   epochs: 50,
                   batchSize: 2,
                   validationSplit: 0.2
               };

               const { model, metrics } = await trainModel(X, y, config);

               expect(model).toBeDefined();
               expect(metrics.accuracy).toBeGreaterThan(0.5);
               expect(metrics.loss).toBeLessThan(1.0);

               // Cleanup
               model.dispose();
               X.dispose();
               y.dispose();
           });

           it('should handle class imbalance with weights', async () => {
               // Test with 80% class 0, 20% class 1
               const X = tf.tensor2d([[1, 2], [2, 3], [3, 4], [4, 5], [5, 6]]);
               const y = tf.tensor2d([[0], [0], [0], [0], [1]]);

               const { model } = await trainModel(X, y, defaultConfig);

               // Model should still learn despite imbalance
               const predictions = model.predict(X) as tf.Tensor2D;
               const predArray = await predictions.array();

               expect(predArray[4][0]).toBeGreaterThan(0.5);  // Minority class

               model.dispose();
               predictions.dispose();
           });

           it('should throw error for insufficient data', async () => {
               const X = tf.tensor2d([[1, 2]]);
               const y = tf.tensor2d([[1]]);

               await expect(trainModel(X, y, defaultConfig))
                   .rejects
                   .toThrow('Insufficient training data');
           });
       });
   });
   ```

**Verification Checklist**:
- [ ] TensorFlow.js installed in `package.json`
- [ ] Model creates with correct input shape (14 features)
- [ ] Training completes without errors
- [ ] Accuracy logged and reasonable (>50% on synthetic data)
- [ ] Class weights calculated and applied correctly
- [ ] Memory management implemented (no leaks)
- [ ] Error handling covers edge cases
- [ ] Unit tests pass with Jest
- [ ] `tf.memory()` shows stable memory usage (no growth)

**Testing Instructions**:
- Unit test: Train on synthetic linearly separable data
- Unit test: Verify model.predict() returns valid probabilities (0-1 range)
- Unit test: Validate class weight calculation
- Unit test: Handle insufficient data (error thrown)
- Unit test: Memory cleanup (check `tf.memory().numTensors` before/after)
- Run: `npm test -- mlModel.test.ts`
- Memory check: `console.log(tf.memory())` before and after training

**Common Pitfalls to Avoid**:
1. ❌ Forgetting to dispose tensors → memory leak
2. ❌ Not reshaping `y` to 2D (shape must be `[numSamples, 1]`)
3. ❌ Using `.dataSync()` on large tensors → blocking
4. ❌ Not awaiting `.fit()` → incomplete training
5. ❌ Hardcoding input dimension instead of using config

**Commit Message Template**:
```
Author & Commiter : HatmanStack
Email : 82614182+HatmanStack@users.noreply.github.com

feat(prediction): implement TensorFlow.js logistic regression training

- Add createLogisticRegressionModel with sigmoid activation
- Implement trainModel with class-balanced weights
- Add validateModel for accuracy evaluation
- Configure Adam optimizer with 0.01 learning rate
- Implement calculateClassWeights for imbalanced datasets
- Add comprehensive memory management with tf.tidy()
- Handle edge cases (insufficient data, shape mismatches, NaN values)
- Add Jest unit tests with synthetic data and memory checks
```

---

### Task 10: Prediction Generation with Horizon Feature

**Goal**: Implement the prediction generation logic that runs the trained model three times (horizon=1, 14, 30) to produce three sets of predictions (direction + probability) for each time horizon.

**Files to Modify/Create**:
- `backend/src/mlModel.ts` - Add prediction functions
- `backend/src/types/prediction.types.ts` - Add `PredictionResult` model
- `__tests__/backend/services/test_mlModel.ts` - Add prediction tests

**Prerequisites**:
- Task 9 completed (model training works)
- Understanding that horizon is the 14th feature (Phase 0, ADR-2)

**Implementation Steps**:
1. Update `types/prediction.types.ts` with `PredictionResult` class:
   - `direction: str` ('up' or 'down')
   - `probability: float` (0-1 range, confidence)
   - `horizon: int` (1, 14, or 30 days)
2. Add to `mlModel.ts`:
   - `generate_predictions(model: LogisticRegression, scaler: StandardScaler, latest_features: DailyFeatures) -> List[PredictionResult]`
     - Extract latest day's features (13 base features)
     - For each horizon in [1, 14, 30]:
       - Create feature vector: [base_features..., horizon] (14 total)
       - Normalize using scaler
       - Predict class: `model.predict(X_horizon)` → 0 or 1
       - Get probability: `model.predict_proba(X_horizon)[:, 1]` → probability of class 1 (up)
       - Map class to direction: 0='down', 1='up'
       - Create PredictionResult(direction, probability, horizon)
     - Return list of 3 PredictionResult objects
3. Implement probability interpretation:
   - If predicted class is 1 (up): probability = prob_class_1
   - If predicted class is 0 (down): probability = 1 - prob_class_1 (or prob_class_0)
   - Ensure probability always represents confidence in predicted direction
4. Add logging:
   - Log predictions for each horizon
   - Log probabilities (for debugging)
5. Write unit tests:
   - Test prediction generation returns 3 results
   - Test each result has correct horizon
   - Test direction is 'up' or 'down'
   - Test probability in 0-1 range
   - Test feature vector includes horizon as 14th feature
   - Test normalization applied correctly

**Verification Checklist**:
- [ ] Three predictions generated (1-day, 2-week, 1-month)
- [ ] Each prediction has direction and probability
- [ ] Probability represents confidence in predicted direction
- [ ] Horizon feature correctly appended to feature vector
- [ ] Feature normalization applied before prediction
- [ ] Unit tests verify prediction structure and values
- [ ] Logged predictions match returned results

**Testing Instructions**:
- Unit test: Generate predictions with mock model
- Unit test: Verify 3 PredictionResult objects returned
- Unit test: Check horizon values (1, 14, 30)
- Unit test: Validate probability range (0-1)
- Unit test: Direction maps correctly (0→down, 1→up)
- Run: `npm test -- backend/__tests__/prediction/test_mlModel.ts::test_generate_predictions -v`

**Commit Message Template**:
```
Author & Commiter : HatmanStack
Email : 82614182+HatmanStack@users.noreply.github.com

feat(prediction): implement three-horizon prediction generation

- Add generate_predictions function with horizon as 14th feature
- Create PredictionResult model for structured output
- Run model 3 times with horizon values 1, 14, 30
- Map predicted class to direction (up/down) with probability
- Add unit tests for prediction generation and validation
```

---

### Task 11: Lambda Handler Integration - End-to-End Pipeline

**Goal**: Integrate all components (data fetching, feature engineering, training, prediction) into the Lambda handler. Implement the complete prediction pipeline that can be invoked via API Gateway.

**Files to Modify/Create**:
- `backend/src/prediction.handler.ts` - Complete handler implementation
- `backend/src/pipeline.py` - Orchestration module
- `__tests__/backend/services/test_prediction.handler.ts` - Integration tests

**Prerequisites**:
- Tasks 5-10 completed (all pipeline components ready)
- Understanding of Lambda event/context structure

**Implementation Steps**:
1. Create `pipeline.py` with orchestration function:
   - `run_prediction_pipeline(ticker: str, days: int) -> List[PredictionResult]`
     - Step 1: Fetch historical data (data_fetcher.fetch_historical_data)
     - Step 2: Aggregate daily features (feature_engineering.aggregate_daily_features)
     - Step 3: Generate labels (feature_engineering.generate_label)
     - Step 4: Prepare training data (preprocessing.prepare_training_data)
     - Step 5: Normalize features (preprocessing.create_scaler, normalize_features)
     - Step 6: Train model (model.train_model)
     - Step 7: Generate predictions (model.generate_predictions)
     - Return list of 3 PredictionResult objects
     - Log each step with timing
2. Update `prediction.handler.ts`:
   - Parse event (extract ticker, days from query params or body)
   - Validate inputs (ticker format, days >= 30)
   - Call `run_prediction_pipeline(ticker, days)`
   - Format response:
     - Success: `{ statusCode: 200, body: JSON with predictions }`
     - Error: `{ statusCode: 400/500, body: error message }`
   - Add CloudWatch logging for debugging
   - Handle exceptions gracefully (log + return error response)
3. Implement error handling:
   - Catch data fetching errors (insufficient data)
   - Catch training errors (convergence, insufficient samples)
   - Catch prediction errors
   - Return appropriate HTTP status codes
4. Write integration tests:
   - Test end-to-end pipeline with mocked data fetcher
   - Test handler with valid event
   - Test handler with invalid inputs (missing ticker, days<30)
   - Test error handling (data fetch failure)
   - Verify response structure

**Verification Checklist**:
- [ ] Handler parses event correctly
- [ ] Pipeline orchestrates all steps in correct order
- [ ] Each step logged with timing information
- [ ] Predictions returned in expected format
- [ ] Error handling returns appropriate status codes
- [ ] Integration tests verify end-to-end flow
- [ ] Mocked data fetcher used in tests (no real DB calls)

**Testing Instructions**:
- Integration test: End-to-end pipeline with mocked data
- Integration test: Handler invocation with valid event
- Integration test: Handler error handling (invalid inputs)
- Integration test: Response structure validation
- Run: `npm test -- backend/__tests__/prediction/test_prediction.handler.ts -v`

**Commit Message Template**:
```
Author & Commiter : HatmanStack
Email : 82614182+HatmanStack@users.noreply.github.com

feat(prediction): integrate end-to-end prediction pipeline in Lambda handler

- Add run_prediction_pipeline orchestration function
- Update handler to parse event and invoke pipeline
- Implement error handling with appropriate HTTP status codes
- Add CloudWatch logging for each pipeline step with timing
- Write integration tests with mocked data fetcher
```

---

### Task 12: Unit Test Suite Completion and Coverage Analysis

**Goal**: Ensure comprehensive unit test coverage (80%+) across all prediction modules. Identify gaps, write missing tests, and verify CI compatibility (tests run without AWS dependencies).

**Files to Modify/Create**:
- `__tests__/backend/services/` - All test files reviewed and completed
- `backend/pytest.ini` - Pytest configuration (if needed)
- `backend/coverage.xml` - Coverage report output

**Prerequisites**:
- Tasks 5-11 completed (all modules implemented)
- Understanding of pytest and coverage tools

**Implementation Steps**:
1. Run coverage analysis:
   - Execute: `pytest --cov=src/functions/prediction --cov-report=html --cov-report=term`
   - Review coverage report (identify uncovered lines)
2. Write missing unit tests:
   - For each module (data_fetcher, feature_engineering, preprocessing, model, pipeline), ensure:
     - All functions have at least one test
     - Edge cases covered (null values, empty lists, boundaries)
     - Error paths tested (exceptions raised)
     - Integration points mocked (database, API)
3. Ensure CI compatibility:
   - No live AWS calls (mock boto3, database connections)
   - Deterministic test data (no random values without seed)
   - Fast execution (<30s total for unit tests)
   - No external dependencies (network calls)
4. Add test fixtures:
   - Create reusable test data (sample prices, sentiment, features)
   - Use pytest fixtures for common setup
   - Store fixtures in `__tests__/backend/services/fixtures.py`
5. Verify test isolation:
   - Each test can run independently
   - No shared state between tests
   - Teardown cleans up resources

**Verification Checklist**:
- [ ] Code coverage >= 80% for all prediction modules
- [ ] All functions have unit tests
- [ ] Edge cases and error paths tested
- [ ] Tests run successfully in CI environment (no AWS dependencies)
- [ ] Test execution time <30s
- [ ] Coverage report generated and reviewed
- [ ] No warnings or errors in test output

**Testing Instructions**:
- Run full test suite: `pytest backend/__tests__/prediction/ -v`
- Run with coverage: `pytest --cov=src/functions/prediction --cov-report=term-missing`
- Verify coverage: Check report shows 80%+ coverage
- CI simulation: Run tests without AWS credentials configured

**Commit Message Template**:
```
Author & Commiter : HatmanStack
Email : 82614182+HatmanStack@users.noreply.github.com

test(prediction): achieve 80%+ unit test coverage

- Add missing unit tests for all prediction modules
- Create test fixtures for reusable test data
- Ensure CI compatibility (no AWS dependencies)
- Verify test isolation and fast execution
- Generate coverage report (80%+ achieved)
```

---

## Phase Verification

### How to Verify Phase 1 Completion

Run the following checks to confirm Phase 1 is complete:

1. **Database Migrations**:
   - [ ] Run `npm test -- migrations/` (all tests pass)
   - [ ] Verify new columns exist in SQLite database
   - [ ] Verify localStorage schema includes new fields

2. **Repository Layer**:
   - [ ] Run `npm test -- repositories/` (all tests pass)
   - [ ] Insert and query operations work with new fields
   - [ ] Backward compatibility verified (old data readable)

3. **Lambda Backend**:
   - [ ] Run `cd backend && sam validate` (template valid)
   - [ ] Run `cd backend && sam build` (build succeeds)
   - [ ] Run `pytest backend/__tests__/prediction/ -v` (all tests pass)
   - [ ] Coverage >= 80%: `pytest --cov=src/functions/prediction --cov-report=term`

4. **Integration Tests**:
   - [ ] Run integration tests with mocked dependencies
   - [ ] Verify end-to-end pipeline produces predictions
   - [ ] Confirm no live AWS calls in test suite

5. **Code Quality**:
   - [ ] Run `npm run lint` (no errors)
   - [ ] Run `npm run type-check` (TypeScript compiles)
   - [ ] Python linting: `flake8 backend/src/` (if configured)

### Integration Points to Test

- **Database ↔ Repositories**: Insert and query new fields correctly
- **Data Fetcher ↔ Database**: Fetch historical data with new fields
- **Feature Engineering ↔ Data Fetcher**: Aggregate per-article to daily
- **Preprocessing ↔ Feature Engineering**: Normalize features correctly
- **Model ↔ Preprocessing**: Train on normalized data
- **Pipeline ↔ All Components**: End-to-end flow produces predictions

### Known Limitations

**Accepted for Phase 1**:
- Lambda not deployed yet (Phase 2)
- No API Gateway integration (Phase 2)
- No frontend integration (Phase 2)
- No UI updates (Phase 2)
- Data fetcher may use placeholder/mock database access (clarify in Task 5)

**Technical Debt**:
- Model performance metrics not stored (accuracy, precision, recall)
- No cross-validation implemented (fast iteration prioritized)
- No feature importance logging (planned for future F-testing)

---

## Next Steps

Once Phase 1 verification is complete and all tests pass:

1. Review Phase 1 implementation with team
2. Ensure CI pipeline passes (GitHub Actions lint + unit tests)
3. Proceed to **[Phase 2: Deployment & Frontend Integration](./Phase-2.md)**

---

## Estimated Token Breakdown

- Task 1: Database migration (per-article fields) - ~8,000 tokens
- Task 2: Database migration (prediction fields) - ~8,000 tokens
- Task 3: Repository updates - ~10,000 tokens
- Task 4: Lambda setup - ~6,000 tokens
- Task 5: Data fetching layer - ~12,000 tokens (includes CLARIFICATION)
- Task 6: Feature engineering - ~15,000 tokens
- Task 7: Label generation - ~8,000 tokens
- Task 8: Feature normalization - ~9,000 tokens
- Task 9: Model training - ~10,000 tokens
- Task 10: Prediction generation - ~9,000 tokens
- Task 11: Handler integration - ~12,000 tokens
- Task 12: Test suite completion - ~8,000 tokens

**Total Estimated**: ~115,000 tokens (within target range, allows for clarifications)
