# Phase 0: Architecture & Foundation

## Purpose

This phase establishes the architectural foundation, design decisions, and shared conventions that apply to all subsequent implementation phases. Read this document completely before starting Phase 1 to understand the technical approach, deployment strategy, and testing patterns that will guide the entire feature implementation.

## Architecture Decision Records (ADRs)

### ADR-1: Lambda-Based Prediction with Existing Function

**Decision**: Implement predictions as a new route (`/predict`) in the existing ReactStocksFunction Lambda, not as a separate Lambda function or browser-based computation.

**Rationale**:
- **Consistency**: Matches existing backend architecture (single Lambda, multiple routes)
- **Simplicity**: No Lambda-to-Lambda invocation, simpler deployment
- **Caching**: DynamoDB historical storage enables multi-user data sharing
- **Performance**: Server-side ML training (~10-20s with TensorFlow.js)
- **Maintenance**: Centralized updates with existing backend

**Implementation**:
- Add `backend/src/handlers/prediction.handler.ts` (follows existing pattern)
- Add `/predict` route to API Gateway (existing ReactStocksApi)
- Use TensorFlow.js for in-Lambda ML training
- Store historical data in DynamoDB for cross-user efficiency

**Implications**:
- SAM template update (add route, not new Lambda)
- Frontend makes separate API call to `/predict` endpoint
- No async polling needed (synchronous response, ~15-20s)
- Integration tests mock HTTP response (not Lambda invocation)

**Alternatives Considered**:
- Separate prediction Lambda (rejected: conflicts with existing architecture)
- Browser-based prediction (rejected: inconsistent performance, no cross-user caching)
- Lambda-to-Lambda chaining (rejected: unnecessary complexity for single-function architecture)

---

### ADR-2: Single Model with Horizon as Feature

**Decision**: Train one logistic regression model with horizon (1, 14, 30 days) as an input feature, running inference three times to generate three predictions.

**Rationale**:
- **Efficiency**: Train once instead of three separate models (3x faster)
- **Shared Learning**: Model learns cross-horizon patterns (early indicators of long-term trends)
- **Simplicity**: Single training pipeline, single model artifact
- **Flexibility**: Easy to add new horizons without architectural changes

**Implementation Details**:
- Feature vector includes `horizon` as 14th feature (values: 1, 14, 30)
- Training data includes examples for all three horizons
- Prediction: Run model 3 times with same features, varying only horizon value
- Model output: 3 pairs of (direction, probability)

**Alternatives Considered**:
- Three separate models (rejected: 3x training time, no shared learning)
- Single model with multi-output (rejected: complex architecture, harder to interpret)

---

### ADR-3: Materiality Score Weighting for Daily Aggregation

**Decision**: Weight articles by their materiality scores when aggregating features from per-article to daily level.

**Rationale**:
- **Quality over Quantity**: Material events (EARNINGS, GUIDANCE with DistilFinBERT) should influence predictions more than non-material events
- **Data-Driven**: Materiality scores reflect importance naturally, no arbitrary weights
- **Existing Infrastructure**: Materiality scores already computed during sentiment processing
- **Interpretability**: Clear why certain days have stronger signals (more material events)

**Weighting Formula**:
```
For articles WITH DistilFinBERT sentiment:
  weight = materiality_score

For articles WITHOUT DistilFinBERT sentiment:
  weight = materiality_score

Daily aggregated feature = Σ(feature_value * weight) / Σ(weight)
```

**Application**:
- Event one-hot encoding: Weighted sum per event type
- Aspect scores: Weighted average across articles
- FinBERT sentiment: Weighted average across material articles

**Alternatives Considered**:
- Binary weighting (2:1 ratio) - rejected: arbitrary, ignores materiality spectrum
- Sentiment magnitude weighting - rejected: circular dependency (sentiment influences weight influences aggregation)
- Equal weighting - rejected: gives undue influence to low-quality articles

---

### ADR-4: Same-Day Labeling Strategy

**Decision**: Label training examples using same-day price movements (previous close → current close), not look-ahead labeling.

**Rationale**:
- **Data Availability**: With 30+ days of historical data, we have sufficient same-day examples
- **Simplicity**: No need to manage look-ahead windows or edge cases (incomplete data at end of range)
- **Immediate Feedback**: Model learns same-day market reactions to news
- **Consistent Labeling**: All three horizons share the same labeling logic (same-day movement)

**Labeling Logic**:
```
price_change = (close_today - close_yesterday) / close_yesterday * 100

IF price_change > 1%:
  label = 1 (up)
ELSE IF price_change < -1%:
  label = 0 (down)
ELSE:
  exclude from training (noise)
```

**Threshold Rationale**:
- ±1% filters daily volatility noise
- Focuses model on meaningful price movements
- Excludes ambiguous cases from training set

**Alternatives Considered**:
- Look-ahead labeling (rejected: complexity, incomplete data at range end)
- Multiple labeling strategies per horizon (rejected: inconsistent, harder to maintain)
- Zero threshold (rejected: too much noise)

---

### ADR-5: On-the-Fly Model Training

**Decision**: Train a new logistic regression model on each prediction request using all available historical data, not pre-trained cached models.

**Rationale**:
- **Simplicity**: No model persistence, versioning, or cache invalidation logic
- **Fresh Data**: Always uses latest historical data (price, sentiment, events)
- **Acceptable Performance**: Scikit-learn logistic regression trains in 5-15s on 30-60 days of data
- **No Staleness**: Eliminates "when to retrain" decision complexity
- **Async Pattern**: Lambda polling pattern makes 10-20s latency acceptable

**Training Process**:
1. Fetch historical data (30+ days of price, sentiment, events, aspect)
2. Aggregate per-article features to daily level (materiality-weighted)
3. Generate labels from same-day price movements
4. Train logistic regression on all historical days
5. Run inference 3 times (horizon=1, 14, 30)
6. Return predictions with probabilities

**Performance Expectations**:
- 30 days: ~5-8s training
- 60 days: ~10-15s training
- 90 days: ~15-20s training

**Alternatives Considered**:
- Pre-trained universal model (rejected: doesn't capture stock-specific patterns)
- Per-stock cached models (rejected: cache invalidation complexity, storage overhead)
- Hybrid pre-train + fine-tune (rejected: over-engineering for current scale)

---

### ADR-6: DynamoDB Caching for Prediction Training Data (Prediction-Scoped)

**Decision**: Use DynamoDB to cache historical data **specifically for ML prediction training** (prices, sentiment features) to enable multi-user efficiency and avoid repeated Tiingo/Finnhub API calls. Frontend SQLite/localStorage **remains the source of truth** for display.

**Scope**: This architecture change applies **only to prediction feature**, not the entire app.

**Rationale**:
- **Multi-User Efficiency**: When User A requests predictions for AAPL, cache training data in DynamoDB so User B's request doesn't re-fetch from expensive APIs
- **API Cost Reduction**: Tiingo/Finnhub APIs have rate limits and costs - cache historical data used for model training
- **Incremental Updates**: Append new date ranges to existing cached data (fetch only what's missing)
- **Prediction Caching**: Cache prediction results in DynamoDB (User A's prediction benefits User B)
- **No Impact on Existing Features**: Stocks, news, sentiment display continue using frontend SQLite/localStorage

**Architecture**:
```
PREDICTION FEATURE ONLY:

DynamoDB Tables (Backend) - ML Training Data Cache:
  ✓ StockHistoricalData (prices for ML training)
  ✓ ArticleAnalysisData (sentiment features for ML)
  ✓ DailySentimentAggregate (aggregated features + prediction results)
  ✓ Multi-user shared cache (permanent, not TTL)

Frontend SQLite/localStorage - Display Source of Truth:
  ✓ Stocks, news, sentiment (existing architecture unchanged)
  ✓ Prediction results (stored for display, same as other data)
  ✓ Offline capability maintained
```

**Data Flow (Prediction Endpoint Only)**:
1. User requests prediction for ticker (via `/predict` endpoint)
2. Backend checks DynamoDB for cached training data:
   - If exists and complete: Use cached data for ML training
   - If missing or partial: Fetch from Tiingo/Finnhub, store in DynamoDB
   - If new date range requested: Append to existing DynamoDB data
3. Backend trains model using DynamoDB data (avoid repeated API calls)
4. Backend returns predictions
5. Frontend stores predictions in local SQLite/localStorage (for display)

**What DOESN'T Change**:
- ❌ Stocks display still uses frontend SQLite/localStorage
- ❌ News display still uses frontend SQLite/localStorage
- ❌ Sentiment display still uses frontend SQLite/localStorage
- ❌ No changes to existing sync orchestrator for display data
- ❌ Offline capability for existing features unchanged

**What DOES Change**:
- ✅ New `/predict` endpoint caches training data in DynamoDB
- ✅ Prediction results cached in DynamoDB (multi-user)
- ✅ Frontend stores prediction results locally (like other features)

**Implications**:
- Backend implements incremental date range appending (prediction data only)
- Backend checks DynamoDB before calling Tiingo/Finnhub (when training models)
- Frontend SQLite/localStorage schema extended (prediction result fields)
- Existing data flow (stocks, news, sentiment) **completely unchanged**

**Alternatives Considered**:
- Full app migration to DynamoDB primary - rejected: massive scope, not needed for predictions
- No caching (fetch from APIs every time) - rejected: expensive, rate limits
- Frontend-only caching - rejected: no multi-user sharing, each user re-fetches same data

---

## Tech Stack

### Backend (Lambda)

**Runtime**: Node.js 20 (TypeScript)
- Existing backend runtime (verified in template.yaml)
- Type safety with TypeScript
- Consistent with existing handlers (sentiment, stocks, news)

**ML Library**: TensorFlow.js (@tensorflow/tfjs-node)
- Logistic regression via `tf.sequential()` with sigmoid activation
- Feature preprocessing with `tf.layers.normalization()`
- Well-documented, production-ready
- No GPU required (CPU-bound is sufficient)
- Native Node.js performance with libtensorflow bindings

**Data Access**: AWS SDK v3 (@aws-sdk/client-dynamodb)
- DynamoDB for historical data storage (multi-user shared cache)
- Query Builder for type-safe DynamoDB operations
- Incremental date range appending

**API Framework**: Existing ReactStocksFunction Lambda
- Add new route handler to existing function
- Reuses existing API Gateway (ReactStocksApi)
- Consistent with existing patterns (sentiment.handler.ts, stocks.handler.ts)
- Built-in logging (CloudWatch)

### Frontend (React Native/Expo)

**State Management**: React Query + Context
- React Query for server/DB cache (existing pattern)
- Context for global UI state (existing pattern)

**Database**: Platform-specific Storage (Source of Truth for Display)
- Native: expo-sqlite (SQLite) - **source of truth** for display data
- Web: localStorage wrapper (existing) - **source of truth** for display data
- **Role**: Primary storage for all display data (stocks, news, sentiment, predictions)
- **Prediction Integration**: Store prediction results like other data (no architecture change)

**HTTP Client**: fetch API
- Consistent with existing services
- Native browser/RN support

**Type Safety**: TypeScript 5.x
- Strong typing for database entities
- API contract validation

### Infrastructure

**Deployment**: AWS SAM (Serverless Application Model)
- Single Lambda function (ReactStocksFunction) with new route
- API Gateway configuration (add /predict route)
- DynamoDB table creation (historical data storage)
- CloudWatch Logs

**CI/CD**: GitHub Actions (lint + test only)
- **NO deployment from CI** (local deployment only)
- ESLint checks
- Unit tests (Jest)
- Integration tests with mocked AWS

---

## Deployment Strategy

### Local Deployment Script (`npm run deploy`)

**Objective**: Interactive, persistent, configuration-driven deployment without SAM guided mode.

#### Script Requirements

**Location**: `backend/scripts/deploy.js` (or similar)

**Workflow**:
1. **Check Prerequisites**
   - AWS CLI configured (`aws sts get-caller-identity`)
   - SAM CLI installed (`sam --version`)
   - Required environment variables

2. **Load/Prompt Configuration**
   - Read from `.deploy-config.json` (git-ignored)
   - If missing values, prompt user interactively
   - Save user inputs to `.deploy-config.json` for future runs
   - Required config:
     - AWS region (default: `us-east-1`)
     - Stack name (default: `stocks-prediction-service`)
     - Lambda memory size (default: `1024`)
     - Lambda timeout (default: `120`)
     - DynamoDB table name (optional, default: `stock-predictions-cache`)

3. **Generate `samconfig.toml`**
   - Programmatically build configuration file
   - Use loaded/prompted values
   - Overwrite existing `samconfig.toml` each run
   - **DO NOT use `sam deploy --guided`**

4. **Build & Deploy**
   - Run `sam build` (compile dependencies)
   - Run `sam deploy` (using generated `samconfig.toml`)
   - Capture stack outputs (API Gateway URL, function ARN)

5. **Update Frontend `.env`**
   - Read stack outputs
   - Update/create `../../.env` in frontend directory
   - Set `EXPO_PUBLIC_PREDICTION_API_URL=<API_Gateway_URL>`
   - Preserve existing env vars

6. **Verify Deployment**
   - Test Lambda invocation (health check)
   - Log success message with API URL

**Error Handling**:
- Clear error messages for missing prerequisites
- Rollback guidance if deployment fails
- Validation of user inputs before deploy

**Example `.deploy-config.json`**:
```json
{
  "region": "us-east-1",
  "stackName": "stocks-prediction-service",
  "lambdaMemory": 1024,
  "lambdaTimeout": 120,
  "dynamoDBTable": "stock-predictions-cache"
}
```

**Example `samconfig.toml` (generated)**:
```toml
version = 0.1
[default.deploy.parameters]
stack_name = "stocks-prediction-service"
region = "us-east-1"
capabilities = "CAPABILITY_IAM"
parameter_overrides = "MemorySize=1024 Timeout=120 TableName=stock-predictions-cache"
```

---

## Testing Strategy

### Unit Tests

**Coverage Target**: 80%+ code coverage

**Scope**:
- All repository methods (database operations)
- Feature engineering functions (aggregation, weighting, normalization)
- Model training logic (training, prediction, label generation)
- API client functions (request formatting, polling logic)
- Utility functions (date formatting, type guards)

**Tools**:
- Jest test framework
- React Native Testing Library (frontend components)
- Python unittest (Lambda functions)

**Patterns**:
- Arrange-Act-Assert structure
- Descriptive test names: `should [expected behavior] when [condition]`
- Mock external dependencies (database, API calls)
- Test edge cases (empty data, null values, boundary conditions)

**Example Test Structure**:
```
describe('DailyAggregator', () => {
  describe('aggregateWithMaterialityWeighting', () => {
    it('should weight articles by materiality score', () => {
      // Arrange: Create test data
      // Act: Call aggregation function
      // Assert: Verify weighted average
    });

    it('should handle zero materiality scores', () => { ... });
    it('should return null when no articles exist', () => { ... });
  });
});
```

### Integration Tests

**Objective**: Verify component integration without live AWS dependencies.

**Mocking Strategy**:
- **Lambda Responses**: Mock API Gateway responses with realistic payloads
- **Database**: Use in-memory SQLite or localStorage mocks
- **External APIs**: Mock Tiingo/Finnhub responses (use existing mocks)

**Scope**:
- Sync orchestration flow (trigger prediction → poll → store → retrieve)
- Repository integration with database migrations
- API client polling mechanism
- React Query cache invalidation

**CI Compatibility**:
- No network calls to AWS
- No live database connections
- Deterministic test data
- Fast execution (<30s total)

**Example Mock**:
```typescript
// Mock Lambda prediction response
const mockPredictionResponse = {
  jobId: 'test-job-123',
  status: 'COMPLETE',
  predictions: {
    nextDay: { direction: 'up', probability: 0.72 },
    twoWeek: { direction: 'up', probability: 0.65 },
    oneMonth: { direction: 'down', probability: 0.48 }
  }
};
```

### End-to-End Tests (Local Only)

**Scope**: Full user flow with actual deployment (not required for CI).

**Scenarios**:
- User selects stock → triggers sync → predictions appear in UI
- Smart refresh: Selecting same stock twice doesn't retrigger prediction
- Error handling: Lambda timeout shows error state in UI
- Portfolio: Predictions persist and display correctly

**Tools**:
- Expo testing tools
- Manual verification

---

## Shared Patterns and Conventions

### Repository Pattern

**Existing Pattern** (see `src/database/repositories/`):
- Repositories abstract database operations
- Platform-agnostic (SQLite for native, localStorage for web)
- Consistent interface: `insert()`, `findByTicker()`, `deleteByTicker()`
- Transactions for multi-row operations

**New Repositories** (Phase 1):
- Update existing repositories for new schema fields
- Follow same naming: `[Entity].repository.ts`
- Export async functions, not classes
- Use prepared statements for SQL injection protection

### Async Polling Pattern

**Existing Pattern** (see `src/services/api/lambdaSentiment.service.ts`):
1. Initiate async job (POST to Lambda)
2. Receive job ID in response
3. Poll for status (GET with job ID)
4. Parse completed result or handle error
5. Return data to caller

**Reuse for Predictions**:
- Same polling interval (2s)
- Same timeout (60s max)
- Same error handling (timeout, failure, retry logic)

### Database Migrations

**Pattern**:
- Use `ALTER TABLE` statements for backward compatibility
- Add nullable columns first, populate, then make NOT NULL if needed
- Include version checks to prevent duplicate migrations
- Test on both SQLite (native) and localStorage (web)

**Example Migration**:
```sql
-- Safe: Add nullable column
ALTER TABLE word_count_details ADD COLUMN eventType TEXT;

-- Populate with default value
UPDATE word_count_details SET eventType = 'GENERAL' WHERE eventType IS NULL;

-- Later: Make NOT NULL if required
-- ALTER TABLE word_count_details ALTER COLUMN eventType SET NOT NULL;
```

### Error Handling Conventions

**Service Layer**:
- Throw custom `APIError` with HTTP status codes
- Log errors with context: `console.error('[ServiceName] Error:', error)`
- Include original error in chain for debugging

**Repository Layer**:
- Log errors with pattern: `console.error('[RepositoryName] Error:', error)`
- Rethrow after logging (let caller decide handling)
- Use transactions for atomic operations

**UI Layer**:
- Display user-friendly messages (no stack traces)
- Provide retry actions where appropriate
- Degrade gracefully (show "—" for missing predictions)

### Commit Message Format

**Convention**: Conventional Commits specification

**Format**:
```
Author & Commiter : HatmanStack
Email : 82614182+HatmanStack@users.noreply.github.com

type(scope): brief description

Detailed explanation line 1
Detailed explanation line 2
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code restructuring without behavior change
- `test`: Adding or updating tests
- `docs`: Documentation only
- `chore`: Build process, dependencies

**Scopes** (for this feature):
- `prediction`: ML model, training logic
- `schema`: Database migrations
- `api`: Lambda functions, API Gateway
- `frontend`: UI components, services
- `deploy`: Deployment scripts, SAM template

**Examples**:
```
feat(schema): add event type and aspect score fields to word_count_details

- Add eventType TEXT column (nullable)
- Add aspectScore REAL column (nullable)
- Add distilFinBERTScore REAL column (nullable)
- Add materialityScore REAL column (nullable)
```

```
feat(prediction): implement logistic regression training with materiality weighting

- Aggregate per-article features to daily level using materiality scores
- Generate labels from same-day price movements (±1% threshold)
- Train scikit-learn LogisticRegression on all available history
- Return predictions for 3 horizons (1-day, 2-week, 1-month)
```

---

## Database Design

### Prediction-Scoped Architecture

**IMPORTANT**: This database design applies **only to the prediction feature**. Existing stocks/news/sentiment infrastructure is unchanged.

**Two-Tier Storage (Prediction Feature Only)**:
1. **Backend (DynamoDB)**: ML training data cache (multi-user shared)
2. **Frontend (SQLite/localStorage)**: Display storage (source of truth, unchanged)

**Principles**:
- DynamoDB caches training data **for prediction computation only**
- Frontend SQLite/localStorage remains **source of truth** for all display data
- Multi-user efficiency: User A's prediction fetch benefits User B
- Incremental updates: Append new date ranges to existing DynamoDB training data
- **No changes** to existing stocks/news/sentiment data flow

### Backend Database (DynamoDB) - NEW TABLES

**`StockHistoricalData` (DynamoDB)**:
- **Partition Key**: `ticker` (STRING)
- **Sort Key**: `date` (STRING, ISO 8601)
- **Attributes**: open, high, low, close, volume, adjClose, marketCap, peRatio, pbRatio, etc.
- **Purpose**: Multi-user shared price history
- **TTL**: NONE (permanent storage)

**`ArticleAnalysisData` (DynamoDB)** - replaces word_count_details concept:
- **Partition Key**: `ticker` (STRING)
- **Sort Key**: `articleHash#date` (STRING, composite)
- **Attributes**:
  - `eventType` (STRING): EARNINGS, M&A, GUIDANCE, ANALYST_RATING, PRODUCT_LAUNCH, GENERAL
  - `aspectScore` (NUMBER): -1 to +1
  - `distilFinBERTScore` (NUMBER): -1 to +1
  - `materialityScore` (NUMBER): 0 to 1
  - `title`, `articleUrl`, `publisher`, `articleDate`
- **Purpose**: Per-article multi-signal analysis
- **TTL**: NONE (permanent storage)

**`DailySentimentAggregate` (DynamoDB)** - replaces combined_word_count_details:
- **Partition Key**: `ticker` (STRING)
- **Sort Key**: `date` (STRING)
- **Attributes**:
  - `eventCounts` (MAP): {"EARNINGS": 2, "M&A": 0, "GUIDANCE": 1, ...}
  - `avgAspectScore` (NUMBER)
  - `avgFinBERTScore` (NUMBER)
  - `materialEventCount` (NUMBER)
  - `nextDayDirection`, `nextDayProbability` (STRING, NUMBER)
  - `twoWeekDirection`, `twoWeekProbability` (STRING, NUMBER)
  - `oneMonthDirection`, `oneMonthProbability` (STRING, NUMBER)
- **Purpose**: Daily aggregated signals + predictions
- **TTL**: NONE (permanent storage)

### Frontend Database (SQLite/localStorage) - SOURCE OF TRUTH (Unchanged)

**`article_analysis_details` (renamed from word_count_details)**:
- Schema extended with new fields: eventType, aspectScore, distilFinBERTScore, materialityScore
- **Role**: Source of truth for display (existing architecture)
- **Change**: Just schema extension, no behavior change

**`daily_sentiment_aggregate` (renamed from combined_word_count_details)**:
- Schema extended with prediction fields: nextDayDirection, nextDayProbability, etc.
- **Role**: Source of truth for display (existing architecture)
- **Change**: Just schema extension, no behavior change

**Storage Behavior** (Existing, Unchanged):
- Data synced from backend APIs (Tiingo, Finnhub, Lambda sentiment)
- Stored locally for offline capability
- Updated when user syncs stock data
- **Prediction results**: Stored same as other data (no special behavior)

### Migration Strategy

**Backend (DynamoDB)**:
1. Create new tables: `StockHistoricalData`, `ArticleAnalysisData`, `DailySentimentAggregate`
2. Populate from existing TTL cache tables (if data exists)
3. Start storing all new data in permanent tables
4. Keep TTL cache tables for backward compatibility (short-term)

**Frontend (SQLite/localStorage)**:
1. Rename tables: `word_count_details` → `article_analysis_details`
2. Rename tables: `combined_word_count_details` → `daily_sentiment_aggregate`
3. Add 4 new fields to `article_analysis_details`:
   - `eventType`, `aspectScore`, `distilFinBERTScore`, `materialityScore`
4. Add 6 new prediction fields to `daily_sentiment_aggregate`:
   - `nextDayDirection`, `nextDayProbability`, etc.
5. Add 6 new prediction fields to `portfolio_details`
6. Update all repositories to use new table names

**Migration Commands**:
```sql
-- Frontend SQLite
ALTER TABLE word_count_details RENAME TO article_analysis_details;
ALTER TABLE combined_word_count_details RENAME TO daily_sentiment_aggregate;
ALTER TABLE article_analysis_details ADD COLUMN eventType TEXT;
ALTER TABLE article_analysis_details ADD COLUMN aspectScore REAL;
ALTER TABLE article_analysis_details ADD COLUMN distilFinBERTScore REAL;
ALTER TABLE article_analysis_details ADD COLUMN materialityScore REAL;
-- (prediction fields omitted for brevity)
```

**Backward Compatibility**:
- Frontend: Alias old table names to new names during transition
- Legacy prediction fields remain (don't drop immediately)
- Gradual rollout: support both old and new field names
- Remove legacy after 2-4 weeks of stable operation

---

## Known Technical Debt

**Accepted for Initial Release**:
- On-the-fly training may be slow for stocks with 90+ days of data (acceptable with async)
- No model performance metrics stored (accuracy, precision, recall)
- No feature importance analysis (planned for Phase 5 F-testing)
- No cross-validation during training (fast iteration prioritized)
- Legacy bag-of-words code remains until full migration complete

**Future Optimization Opportunities**:
- Model caching (train once per ticker per day, cache in DynamoDB)
- Batch predictions for portfolio (single Lambda call for all tickers)
- Feature importance logging (identify which features drive predictions)
- A/B testing framework (compare multi-signal vs bag-of-words accuracy)

---

## Reference Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Action                             │
│                  (Select Stock in UI)                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             v
┌─────────────────────────────────────────────────────────────────┐
│                    Sync Orchestrator                            │
│  (Checks: New articles exist? Trigger prediction)               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             v
┌─────────────────────────────────────────────────────────────────┐
│                Prediction API Client (Frontend)                 │
│  1. POST /predict → jobId                                       │
│  2. Poll GET /predict/{jobId} → status                          │
│  3. Receive predictions when complete                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             v
┌─────────────────────────────────────────────────────────────────┐
│              Lambda Prediction Service (Backend)                │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ 1. Fetch Data (price, sentiment, events, aspect)         │ │
│  │ 2. Aggregate to Daily (materiality-weighted)             │ │
│  │ 3. Generate Labels (same-day ±1% threshold)              │ │
│  │ 4. Train Logistic Regression (on-the-fly)                │ │
│  │ 5. Predict (horizon=1,14,30)                             │ │
│  │ 6. Cache Result (optional DynamoDB)                      │ │
│  └───────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             v
┌─────────────────────────────────────────────────────────────────┐
│              Frontend: Store in Local Database                  │
│  - combined_word_count_details (daily predictions)              │
│  - portfolio_details (portfolio predictions)                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             v
┌─────────────────────────────────────────────────────────────────┐
│                    UI Components Read & Display                 │
│  - Sentiment Tab: CombinedWordItem (↑ 72%)                      │
│  - Portfolio: PortfolioItem (↓ 38%)                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Questions for Plan Reviewer

*None at this time. If architectural decisions need clarification during implementation, use QUESTION or CLARIFICATION keywords in subsequent phases.*

---

## Next Steps

Proceed to **[Phase 1: Backend Infrastructure & ML Model](./Phase-1.md)** to begin implementation of database migrations and Lambda prediction service.
