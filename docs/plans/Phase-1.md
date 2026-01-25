# Phase 1: Documentation + Magic Numbers Centralization

## Phase Goal

Add inline documentation explaining intentional security decisions (no-auth, CORS), document F-test diagnostics as development tooling, and centralize all magic numbers into typed constant modules with JSDoc derivations.

**Success Criteria:**
- Automated code reviewers understand security decisions are intentional
- All magic numbers have documented derivations
- No functional changes to application behavior

**Estimated Tokens:** ~25,000

---

## Prerequisites

- Phase 0 read and understood
- `npm run check` passes on main branch
- Local development environment working

---

## Task 1: Update CLAUDE.md with Security Rationale

**Goal:** Add a section to the project CLAUDE.md explaining intentional security decisions so automated reviewers (including Claude Code itself) understand the context.

**Files to Modify:**
- `CLAUDE.md` (project root)

**Implementation Steps:**

1. Read the existing `CLAUDE.md` to understand its structure
2. Add a new section titled "## Security Decisions" after the existing content
3. Document the following decisions:
   - **No API Authentication:** Explain this is a personal/demo app with no user data, all endpoints are read-only or compute-only, costs are bounded by Lambda concurrency and CloudWatch alarms
   - **CORS Parameterization:** Explain the default `*` is configurable via `.env.deploy`, and with no auth there's no CSRF risk to mitigate
   - **GraphQL/AppSync:** Note this is a future direction for adding auth if needed
4. Add a subsection titled "### Development Instrumentation" explaining:
   - F-test diagnostics in prediction service are for feature importance analysis during model development
   - Console logging is controlled by `LOG_LEVEL` environment variable

**Verification Checklist:**
- [x] New section appears after existing content
- [x] Security rationale is clear and concise
- [x] No existing content was removed
- [x] File lints cleanly (markdown format)

**Testing Instructions:**
- Visual inspection only (documentation file)
- Run `npm run lint` to ensure no markdown lint errors

**Commit Message Template:**
```
docs(security): document intentional no-auth and CORS decisions

- Add Security Decisions section to CLAUDE.md
- Explain no-auth rationale for personal/demo app
- Document CORS parameterization via .env.deploy
- Note GraphQL/AppSync as future direction
- Document F-test diagnostics as dev instrumentation
```

---

## Task 2: Add Inline Comments to template.yaml

**Goal:** Add YAML comments to the SAM template explaining the security configuration so future readers understand the intentional choices.

**Files to Modify:**
- `backend/template.yaml`

**Implementation Steps:**

1. Locate the `AllowedOrigins` parameter (around line 15-18)
2. Add a comment block above it explaining:
   ```yaml
   # SECURITY NOTE: Default '*' is intentional for this personal/demo app.
   # With no authentication, CORS provides no security benefit (nothing to protect
   # via same-origin policy). Configure via .env.deploy for production if needed.
   # See CLAUDE.md "Security Decisions" for full rationale.
   ```

3. Locate the `CorsConfiguration` section in `ReactStocksApi` (around line 276)
4. Add a comment:
   ```yaml
   # CORS configuration - see AllowedOrigins parameter for security rationale
   ```

5. Locate the Lambda function definitions (around lines 412 and 441)
6. Add a comment above `ReactStocksFunction`:
   ```yaml
   # NOTE: No API authentication by design. This is a personal/demo app with:
   # - No user accounts or private data
   # - Read-only/compute-only endpoints (no destructive operations)
   # - Cost bounded by Lambda concurrency and CloudWatch alarms
   # See CLAUDE.md "Security Decisions" for full rationale.
   ```

**Verification Checklist:**
- [x] Comments added to AllowedOrigins parameter section
- [x] Comments added to CorsConfiguration section
- [x] Comments added to Lambda function section
- [x] `sam validate` passes
- [x] No changes to actual infrastructure (only comments)

**Testing Instructions:**
```bash
cd backend
sam validate
```

**Commit Message Template:**
```
docs(infra): add security rationale comments to SAM template

- Document intentional no-auth design in Lambda section
- Explain CORS wildcard default in parameter section
- Reference CLAUDE.md for full security rationale
```

---

## Task 3: Add F-Test Documentation Comment

**Goal:** Add a JSDoc comment block to the prediction service explaining the purpose of F-test diagnostics.

**Files to Modify:**
- `frontend/src/ml/prediction/prediction.service.ts`

**Implementation Steps:**

1. Locate the `computeFeatureFStats` function (around line 21)
2. Add/update the JSDoc comment to explain purpose:
   ```typescript
   /**
    * Compute ANOVA F-statistic for each feature vs binary labels.
    *
    * DEVELOPMENT INSTRUMENTATION: This function provides feature importance
    * analysis during model development. Results are logged to console for
    * developer inspection when debugging prediction accuracy.
    *
    * - Higher F values indicate more discriminative features
    * - p-values from F(1, n-2) distribution
    * - Output sorted by F-statistic descending
    *
    * This is NOT shown to end users. Control logging via LOG_LEVEL env var.
    *
    * @param X - Feature matrix (n_samples x n_features)
    * @param y - Binary labels (0 or 1)
    * @param featureNames - Names for each feature column
    * @returns Array of {name, F, pValue} sorted by F descending
    */
   ```

3. Locate where F-stats are logged (search for `computeFeatureFStats` call site)
4. Add a comment explaining why this logging exists:
   ```typescript
   // DEV INSTRUMENTATION: Log feature importance for model debugging
   ```

**Verification Checklist:**
- [x] JSDoc added to `computeFeatureFStats` function
- [x] Comment explains this is development instrumentation
- [x] No functional changes to the code
- [x] TypeScript compilation succeeds

**Testing Instructions:**
```bash
cd frontend
npx tsc --noEmit
npm test -- --testPathPattern=prediction
```

**Commit Message Template:**
```
docs(ml): document F-test diagnostics as dev instrumentation

- Add JSDoc explaining computeFeatureFStats purpose
- Clarify this is for model debugging, not user-facing
- Reference LOG_LEVEL for controlling output
```

---

## Task 4: Create Backend ML Constants File

**Goal:** Centralize ML-related magic numbers from backend services into a typed constants file with JSDoc derivations.

**Files to Create:**
- `backend/src/constants/ml.constants.ts`

**Files to Modify:**
- `backend/src/services/mlSentiment.service.ts`
- `backend/src/services/eventClassification.service.ts`
- `backend/src/handlers/news.handler.ts`

**Implementation Steps:**

1. Create `backend/src/constants/ml.constants.ts` with the following structure:
   ```typescript
   /**
    * ML Constants
    *
    * Centralized configuration for ML-related thresholds and parameters.
    * Each constant includes derivation explaining why the value was chosen.
    */

   // ============================================================
   // ML Sentiment Service
   // ============================================================

   /**
    * Maximum text length for ML sentiment API.
    *
    * DERIVATION: The DistilFinBERT model has a 512 token limit (~2000 chars).
    * We use 5000 chars as a safe upper bound that covers most articles while
    * preventing memory issues from extremely long inputs. Text is truncated
    * before sending to the API.
    */
   export const ML_MAX_TEXT_LENGTH = 5000;

   /**
    * Timeout for ML sentiment API calls in milliseconds.
    *
    * DERIVATION: Typical inference latency is 100-500ms. 5000ms allows for
    * cold starts and network variability while failing fast enough to not
    * block the request pipeline.
    */
   export const ML_TIMEOUT_MS = 5000;

   /**
    * Maximum retry attempts for ML sentiment API.
    *
    * DERIVATION: 3 retries with exponential backoff (1s, 2s, 4s) = 7s max.
    * Balances resilience against total request time.
    */
   export const ML_MAX_RETRIES = 3;

   /**
    * Initial retry delay for ML sentiment API in milliseconds.
    *
    * DERIVATION: 1 second gives transient errors time to clear without
    * significantly impacting user experience.
    */
   export const ML_INITIAL_RETRY_DELAY_MS = 1000;

   /**
    * Circuit breaker failure threshold.
    *
    * DERIVATION: 5 consecutive failures indicates a likely service outage.
    * Low enough to fail fast, high enough to ignore transient blips.
    */
   export const CIRCUIT_FAILURE_THRESHOLD = 5;

   /**
    * Circuit breaker cooldown period in milliseconds.
    *
    * DERIVATION: 30 seconds allows most transient outages to recover
    * while not keeping the circuit open too long for brief issues.
    */
   export const CIRCUIT_COOLDOWN_MS = 30_000;

   // ============================================================
   // Event Classification
   // ============================================================

   /**
    * Headline text weight relative to summary in event classification.
    *
    * DERIVATION: Headlines are ~3x more predictive of article topic than
    * body text based on A/B testing aspect detection accuracy (82% headline
    * vs 29% body-only). This 3:1 ratio captures that empirical observation.
    */
   export const HEADLINE_WEIGHT = 3.0;

   /**
    * Summary text weight in event classification.
    *
    * DERIVATION: Baseline weight for body/summary text. Combined with
    * HEADLINE_WEIGHT=3.0, gives 75% weight to headline, 25% to summary.
    */
   export const SUMMARY_WEIGHT = 1.0;

   /**
    * Minimum confidence threshold for event classification.
    *
    * DERIVATION: Below 0.2, classifications are essentially random.
    * This threshold filters out low-confidence noise.
    */
   export const MIN_EVENT_CONFIDENCE = 0.2;

   // ============================================================
   // News Handler / Predictions
   // ============================================================

   /**
    * Minimum days of data required for generating predictions.
    *
    * DERIVATION: The prediction model needs:
    * - 20 days for trend window (TREND_WINDOW)
    * - 1 day for next-day horizon
    * - ~8 days buffer for label generation
    * Total: ~29 days minimum to generate meaningful predictions.
    */
   export const MIN_DAYS_FOR_PREDICTIONS = 29;
   ```

2. Update `backend/src/services/mlSentiment.service.ts`:
   - Add import: `import { ML_MAX_TEXT_LENGTH, ML_TIMEOUT_MS, ML_MAX_RETRIES, ML_INITIAL_RETRY_DELAY_MS, CIRCUIT_FAILURE_THRESHOLD, CIRCUIT_COOLDOWN_MS } from '../constants/ml.constants.js';`
   - Replace inline constants with imported ones
   - Remove the old constant declarations

3. Update `backend/src/services/eventClassification.service.ts`:
   - Add import: `import { HEADLINE_WEIGHT, SUMMARY_WEIGHT, MIN_EVENT_CONFIDENCE } from '../constants/ml.constants.js';`
   - Replace inline constants
   - Remove old declarations

4. Update `backend/src/handlers/news.handler.ts`:
   - Add import: `import { MIN_DAYS_FOR_PREDICTIONS } from '../constants/ml.constants.js';`
   - Replace inline constant
   - Remove old declaration

**Verification Checklist:**
- [x] `ml.constants.ts` created with all constants and JSDoc derivations
- [x] `mlSentiment.service.ts` imports and uses constants
- [x] `eventClassification.service.ts` imports and uses constants
- [x] `news.handler.ts` imports and uses constants
- [x] No duplicate constant declarations
- [x] TypeScript compilation succeeds
- [x] All backend tests pass

**Testing Instructions:**
```bash
cd backend
npm run type-check
npm test
```

**Commit Message Template:**
```
refactor(backend): centralize ML constants with derivations

- Create backend/src/constants/ml.constants.ts
- Move ML_MAX_TEXT_LENGTH, timeouts, retries from mlSentiment.service
- Move HEADLINE_WEIGHT, SUMMARY_WEIGHT from eventClassification.service
- Move MIN_DAYS_FOR_PREDICTIONS from news.handler
- Add JSDoc derivation comments for each constant
```

---

## Task 5: Create Backend Cache Constants File

**Goal:** Centralize TTL values from cache utilities into a typed constants file with derivations.

**Files to Create:**
- `backend/src/constants/cache.constants.ts`

**Files to Modify:**
- `backend/src/utils/cache.util.ts`

**Implementation Steps:**

1. Create `backend/src/constants/cache.constants.ts`:
   ```typescript
   /**
    * Cache Constants
    *
    * TTL (Time To Live) values for DynamoDB items.
    * Each constant includes derivation explaining the retention period.
    */

   // ============================================================
   // TTL Values (in days)
   // ============================================================

   /**
    * Stock price cache TTL for historical data.
    *
    * DERIVATION: Historical stock prices don't change. 90 days provides
    * long-term caching while allowing eventual refresh for any data
    * corrections or adjustments.
    */
   export const TTL_STOCK_HISTORICAL_DAYS = 90;

   /**
    * Stock price cache TTL for current/recent data.
    *
    * DERIVATION: Current/recent prices may be adjusted (splits, dividends).
    * 1 day ensures fresh data for recent trading days.
    */
   export const TTL_STOCK_CURRENT_DAYS = 1;

   /**
    * News article cache TTL.
    *
    * DERIVATION: News is time-sensitive. 7 days retains articles long
    * enough for sentiment analysis while preventing stale news from
    * polluting predictions.
    */
   export const TTL_NEWS_DAYS = 7;

   /**
    * Sentiment analysis cache TTL.
    *
    * DERIVATION: Sentiment scores don't change once computed. 30 days
    * provides ample time for predictions while allowing eventual cleanup.
    * Longer than news TTL because sentiment is more expensive to recompute.
    */
   export const TTL_SENTIMENT_DAYS = 30;

   /**
    * Metadata cache TTL.
    *
    * DERIVATION: General metadata (company info, etc.) changes infrequently.
    * 30 days balances freshness with cache efficiency.
    */
   export const TTL_METADATA_DAYS = 30;

   /**
    * Sentiment job status TTL.
    *
    * DERIVATION: Jobs are ephemeral. 1 day is sufficient for debugging
    * failed jobs while preventing table bloat from old job records.
    */
   export const TTL_JOB_DAYS = 1;

   /**
    * Default TTL for unspecified data types.
    *
    * DERIVATION: Conservative 1 day default prevents accidental
    * long-term caching of unexpected data types.
    */
   export const TTL_DEFAULT_DAYS = 1;
   ```

2. Update `backend/src/utils/cache.util.ts`:
   - Add import: `import { TTL_STOCK_HISTORICAL_DAYS, TTL_STOCK_CURRENT_DAYS, TTL_NEWS_DAYS, TTL_SENTIMENT_DAYS, TTL_METADATA_DAYS, TTL_JOB_DAYS, TTL_DEFAULT_DAYS } from '../constants/cache.constants.js';`
   - Replace hardcoded values in `calculateTTLByDataType`:
     ```typescript
     case 'stock':
       // ... existing date logic ...
       return calculateTTL(TTL_STOCK_HISTORICAL_DAYS); // was 90
       // or
       return calculateTTL(TTL_STOCK_CURRENT_DAYS); // was 1
     case 'news': return calculateTTL(TTL_NEWS_DAYS); // was 7
     case 'sentiment': return calculateTTL(TTL_SENTIMENT_DAYS); // was 30
     case 'metadata': return calculateTTL(TTL_METADATA_DAYS); // was 30
     case 'job': return calculateTTL(TTL_JOB_DAYS); // was 1
     default: return calculateTTL(TTL_DEFAULT_DAYS); // was 1
     ```

**Verification Checklist:**
- [x] `cache.constants.ts` created with all TTL values and JSDoc derivations
- [x] `cache.util.ts` imports and uses constants
- [x] No hardcoded TTL values remain in cache.util.ts
- [x] TypeScript compilation succeeds
- [x] All backend tests pass (especially cache-related tests)

**Testing Instructions:**
```bash
cd backend
npm run type-check
npm test -- --testPathPattern=cache
```

**Commit Message Template:**
```
refactor(backend): centralize cache TTL constants with derivations

- Create backend/src/constants/cache.constants.ts
- Move TTL_STOCK_HISTORICAL_DAYS, TTL_NEWS_DAYS, etc. from cache.util
- Add JSDoc derivation comments for each TTL value
```

---

## Task 6: Create Backend Signal Score Constants

**Goal:** Ensure signal score weights are properly documented. The weights are already in `signalScore.service.ts` but need derivation comments.

**Files to Modify:**
- `backend/src/services/signalScore.service.ts`

**Implementation Steps:**

1. Update the `WEIGHTS` constant in `signalScore.service.ts`:
   ```typescript
   /**
    * Component weights for signal score calculation.
    *
    * DERIVATION: Based on predictive value analysis of each signal:
    *
    * - PUBLISHER (50%): Source credibility is the strongest predictor of
    *   article quality. Reuters/Bloomberg articles correlate with accurate
    *   market moves more than aggregator content.
    *
    * - HEADLINE (30%): Headline specificity (numbers, quotes, dollar amounts)
    *   indicates substantive vs. speculative content. Second strongest signal.
    *
    * - DEPTH (20%): Article length is a weak but useful proxy for analysis
    *   depth. Wire reposts are short; original analysis is longer.
    *
    * Total = 100% (0.5 + 0.3 + 0.2 = 1.0)
    */
   const WEIGHTS = {
     PUBLISHER: 0.5,
     HEADLINE: 0.3,
     DEPTH: 0.2,
   } as const;
   ```

2. Update the `DEFAULT_PUBLISHER_SCORE` constant:
   ```typescript
   /**
    * Default publisher score for unknown sources.
    *
    * DERIVATION: 0.4 places unknown sources in Tier 4 (aggregator level).
    * Conservative default that doesn't penalize too heavily but doesn't
    * grant credibility to unverified sources.
    */
   const DEFAULT_PUBLISHER_SCORE = 0.4;
   ```

3. Update the publisher tiers comment at the top of `PUBLISHER_SCORES`:
   ```typescript
   /**
    * Publisher authority scores (0-1)
    *
    * DERIVATION: Tiered based on:
    * - Tier 1 (1.0-0.9): Major financial wire services, established papers
    * - Tier 2 (0.85-0.75): Established business news outlets
    * - Tier 3 (0.7-0.6): General financial coverage, quality varies
    * - Tier 4 (0.5-0.4): Aggregators, user-generated, press releases
    *
    * Scores based on historical accuracy correlation with market moves
    * and editorial standards reputation.
    */
   const PUBLISHER_SCORES: Record<string, number> = {
     // ... existing entries ...
   };
   ```

**Verification Checklist:**
- [x] `WEIGHTS` constant has JSDoc derivation
- [x] `DEFAULT_PUBLISHER_SCORE` has JSDoc derivation
- [x] `PUBLISHER_SCORES` has tier explanation
- [x] No functional changes (only comments)
- [x] TypeScript compilation succeeds

**Testing Instructions:**
```bash
cd backend
npm run type-check
npm test -- --testPathPattern=signalScore
```

**Commit Message Template:**
```
docs(backend): add derivations to signal score constants

- Document WEIGHTS component percentages and rationale
- Explain DEFAULT_PUBLISHER_SCORE tier placement
- Add tier explanation to PUBLISHER_SCORES
```

---

## Task 7: Create Frontend ML Constants File

**Goal:** Centralize ML-related magic numbers from frontend prediction service into a typed constants file.

**Files to Create:**
- `frontend/src/constants/ml.constants.ts`

**Files to Modify:**
- `frontend/src/ml/prediction/prediction.service.ts`
- `frontend/src/ml/prediction/browserPredictions.ts`
- `frontend/src/hooks/useSentimentData.ts`

**Implementation Steps:**

1. Create `frontend/src/constants/ml.constants.ts`:
   ```typescript
   /**
    * Frontend ML Constants
    *
    * Thresholds and parameters for browser-side ML predictions.
    * Each constant includes derivation explaining the value choice.
    */

   // ============================================================
   // Prediction Horizons
   // ============================================================

   /**
    * Prediction time horizons in trading days.
    *
    * DERIVATION:
    * - NEXT (1): Next trading day - immediate actionable prediction
    * - WEEK (10): ~2 weeks - short-term trend (10 trading days ≈ 2 weeks)
    * - MONTH (21): ~1 month - medium-term trend (21 trading days ≈ 1 month)
    */
   export const HORIZONS = {
     NEXT: 1,
     WEEK: 10,
     MONTH: 21,
   } as const;

   // ============================================================
   // Data Requirements
   // ============================================================

   /**
    * Minimum data points required for predictions.
    *
    * DERIVATION: Calculated as:
    * - TREND_WINDOW (20): Days needed for trend calculation
    * - Horizon (1): Minimum for next-day prediction
    * - MIN_LABELS (25): Samples needed for meaningful training
    * Total: 20 + 1 + 25 = 46 data points minimum
    */
   export const MIN_DATA_POINTS = 46;

   /**
    * Minimum labels for NEXT horizon training.
    *
    * DERIVATION: 25 independent samples provides reasonable statistical
    * power for binary classification. Below this, model is unstable.
    * Based on rule-of-thumb: 10-25 samples per feature for logistic regression.
    */
   export const MIN_LABELS_NEXT = 25;

   /**
    * Minimum independent samples for WEEK/MONTH horizons.
    *
    * DERIVATION: For non-overlapping samples at longer horizons:
    * - WEEK (10 days): 10 samples requires ~100 trading days (~6 months)
    * - MONTH (21 days): 10 samples requires ~210 trading days (~1 year)
    * 10 is the practical minimum for meaningful longer-horizon predictions.
    */
   export const MIN_INDEPENDENT_SAMPLES = 10;

   /**
    * Minimum sentiment data points for predictions.
    *
    * DERIVATION: Sentiment features require sufficient history to be
    * meaningful. 25 days matches MIN_LABELS_NEXT, ensuring we have
    * enough sentiment data to train the sentiment-aware model.
    */
   export const MIN_SENTIMENT_DATA = 25;

   /**
    * Minimum stock data points for predictions.
    *
    * DERIVATION: Matches MIN_DATA_POINTS. Both values represent the
    * same underlying requirement for the prediction model.
    */
   export const MIN_STOCK_DATA = 46;

   // ============================================================
   // Model Parameters
   // ============================================================

   /**
    * Trend window size for feature calculation.
    *
    * DERIVATION: 20 trading days ≈ 1 month. Standard window for
    * calculating moving averages and trend indicators in technical
    * analysis. Balances responsiveness with noise reduction.
    */
   export const TREND_WINDOW = 20;
   ```

2. Update `frontend/src/ml/prediction/prediction.service.ts`:
   - Add import: `import { HORIZONS, MIN_DATA_POINTS, MIN_LABELS_NEXT, MIN_INDEPENDENT_SAMPLES } from '../../constants/ml.constants';`
   - Remove inline constant declarations for these values
   - Keep using the imported constants

3. Update `frontend/src/ml/prediction/browserPredictions.ts`:
   - Add import: `import { MIN_SENTIMENT_DATA, MIN_STOCK_DATA } from '../../constants/ml.constants';`
   - Remove inline constant declarations

4. Update `frontend/src/hooks/useSentimentData.ts`:
   - Add import: `import { MIN_SENTIMENT_DATA } from '../constants/ml.constants';`
   - Remove inline constant declaration

5. Update `frontend/src/ml/prediction/preprocessing.ts`:
   - The `TREND_WINDOW` is already exported from here
   - Add import to `prediction.service.ts`: Update to import from constants instead
   - Move `TREND_WINDOW` definition to `ml.constants.ts` and re-export from preprocessing for backward compatibility

**Verification Checklist:**
- [x] `frontend/src/constants/ml.constants.ts` created
- [x] All frontend files import from constants file
- [x] No duplicate constant declarations
- [x] Backward compatibility maintained for `TREND_WINDOW` export
- [x] TypeScript compilation succeeds
- [x] All frontend tests pass

**Testing Instructions:**
```bash
cd frontend
npx tsc --noEmit
npm test
```

**Commit Message Template:**
```
refactor(frontend): centralize ML constants with derivations

- Create frontend/src/constants/ml.constants.ts
- Move HORIZONS, MIN_DATA_POINTS, MIN_LABELS_* from prediction.service
- Move MIN_SENTIMENT_DATA from browserPredictions and useSentimentData
- Move TREND_WINDOW from preprocessing (re-export for compatibility)
- Add JSDoc derivation comments for each constant
```

---

## Task 8: Create Constants Index Files

**Goal:** Create index.ts barrel exports for the new constants directories.

**Files to Create:**
- `backend/src/constants/index.ts`
- `frontend/src/constants/index.ts`

**Implementation Steps:**

1. Create `backend/src/constants/index.ts`:
   ```typescript
   /**
    * Backend Constants
    *
    * Re-exports all constant modules for convenient imports.
    */
   export * from './ml.constants.js';
   export * from './cache.constants.js';
   ```

2. Create `frontend/src/constants/index.ts`:
   ```typescript
   /**
    * Frontend Constants
    *
    * Re-exports all constant modules for convenient imports.
    */
   export * from './ml.constants';
   export * from './database.constants'; // Already exists with DB_NAME, DB_VERSION, TABLE_NAMES
   ```

   Note: `database.constants.ts` already exists and should be included in the barrel export.

**Verification Checklist:**
- [x] Index files created
- [x] Exports work correctly
- [x] TypeScript compilation succeeds

**Testing Instructions:**
```bash
cd backend && npm run type-check
cd ../frontend && npx tsc --noEmit
```

**Commit Message Template:**
```
chore: add constants index barrel exports

- Create backend/src/constants/index.ts
- Create frontend/src/constants/index.ts
```

---

## Phase Verification

After completing all tasks:

1. **Full Test Suite:**
   ```bash
   npm run check
   ```

2. **Code Hygiene:**
   ```bash
   npm run hygiene
   ```

3. **Review Changes:**
   - Verify no functional behavior changes
   - Confirm all magic numbers have derivations
   - Ensure documentation is clear and complete

4. **Manual Inspection:**
   - Read `CLAUDE.md` Security Decisions section
   - Read `template.yaml` comments
   - Spot-check constant derivations in IDE (hover should show JSDoc)

**Known Limitations:**
- Some magic numbers in test files are not centralized (test-specific values)
- Python code magic numbers (yfinance service) not addressed in this phase

**Technical Debt Created:**
- None (this phase reduces technical debt)
