# Phase 4: Data Schema & Storage Updates

## Phase Goal

Update database schema and data aggregation logic to store and expose all three sentiment signals (event type, aspect score, DistilFinBERT sentiment) for consumption by the prediction model and frontend UI.

**Success Criteria:**
- Sentiment cache schema includes all three signals
- Daily aggregation combines multi-signal data correctly
- Prediction model receives three new features
- Backward compatibility maintained (old data still works)
- Migration path documented for existing cached data
- All repository methods updated

**Estimated Tokens:** ~75,000

---

## Prerequisites

- Phases 1, 2, 3 completed
- All three signals (event, aspect, finBERT) generating successfully
- Understanding of prediction model feature requirements

---

## Tasks

### Task 1: Finalize Sentiment Cache Schema

**Goal:** Consolidate all schema changes from Phases 1-3 into final unified schema.

**Files to Modify:**
- `backend/src/repositories/sentimentCache.repository.ts` - Final schema
- `backend/src/types/sentiment.types.ts` - Complete type definitions

**Final Schema:**
```typescript
export interface SentimentCacheItem {
  // DynamoDB keys
  ticker: string;              // Partition key
  articleHash: string;         // Sort key

  // Legacy sentiment data (kept for backward compat)
  sentiment: {
    positive: number;          // Sentence count (deprecated)
    negative: number;          // Sentence count (deprecated)
    sentimentScore: number;    // Overall score (may differ from finBERT)
    classification: 'POS' | 'NEG' | 'NEUT';
  };

  // NEW: Three-signal architecture
  eventType: EventType;                    // Phase 1
  aspectScore: number;                     // Phase 2 (-1 to +1)
  aspectBreakdown?: AspectBreakdown;       // Phase 2 (optional detailed)
  distilFinBERTScore?: number;             // Phase 3 (-1 to +1, material events only)

  // Metadata
  analyzedAt: number;          // Timestamp
  ttl: number;                 // DynamoDB TTL
  modelVersion: string;        // Track analysis version (e.g., "v2.0")
}
```

**Implementation:**
- All fields documented with JSDoc
- Optional fields clearly marked
- Type guards for backward compat
- Validation helpers

**Verification:**
- Schema compiles without errors
- All optional fields truly optional
- Type guards work for old/new items

**Estimated Tokens:** ~8,000

---

### Task 2: Update Daily Aggregation Logic

**Goal:** Update daily sentiment aggregation to include event type distribution and average aspect/finBERT scores.

**Files to Modify:**
- `backend/src/utils/sentiment.util.ts` - `aggregateDailySentiment` function

**Current Daily Sentiment:**
```typescript
interface DailySentiment {
  date: string;
  positiveCount: number;
  negativeCount: number;
  sentimentScore: number;
}
```

**New Daily Sentiment:**
```typescript
interface DailySentiment {
  date: string;

  // Legacy (keep for charts)
  positiveCount: number;
  negativeCount: number;
  sentimentScore: number;

  // NEW: Event distribution
  eventCounts: {
    EARNINGS: number;
    M&A: number;
    GUIDANCE: number;
    ANALYST_RATING: number;
    PRODUCT_LAUNCH: number;
    GENERAL: number;
  };

  // NEW: Average scores across all articles for the day
  avgAspectScore: number;      // Average of all article aspect scores
  avgFinBERTScore: number;     // Average of all material event finBERT scores
  materialEventCount: number;  // Count of articles with finBERT scores
}
```

**Implementation:**
- Aggregate event types: count each type per day
- Average aspect scores: sum / count (skip if score = 0)
- Average finBERT scores: sum / count (skip if null/undefined)
- Maintain legacy fields for backward compat

**Verification:**
- Aggregation produces correct counts
- Averages calculated correctly
- Old code using legacy fields still works
- New fields populated when data present

**Testing:**
- Test with mix of material and non-material events
- Test with missing aspect scores
- Test with missing finBERT scores
- Verify averages mathematically

**Estimated Tokens:** ~12,000

---

### Task 3: Update Prediction Model Feature Matrix

**Goal:** Add three new features to prediction model input: event type (one-hot encoded), aspect score, finBERT score.

**Files to Modify:**
- `src/ml/prediction/preprocessing.ts` - `buildFeatureMatrix` function
- `src/ml/prediction/types.ts` - Update `PredictionInput` interface

**Current Features (8 total):**
1. Price ratio 1-day
2. Price ratio 5-day
3. Price ratio 10-day
4. Volume normalized
5. Positive word count (deprecated)
6. Negative word count (deprecated)
7. Volatility
8. Sentiment category (POS/NEG/NEUT → 1/0/-1)

**New Features (14 total):**
1-4. Price features (unchanged)
5-10. Event type (one-hot encoded: 6 features)
11. Aspect score (-1 to +1)
12. DistilFinBERT score (-1 to +1, fallback to sentiment score if missing)
13. Volatility (unchanged)
14. (Remove old positive/negative counts)

**One-Hot Encoding Example:**
```
EARNINGS → [1, 0, 0, 0, 0, 0]
M&A      → [0, 1, 0, 0, 0, 0]
GUIDANCE → [0, 0, 1, 0, 0, 0]
...
GENERAL  → [0, 0, 0, 0, 0, 1]
```

**Implementation:**
- Add `eventType`, `aspectScore`, `finBERTScore` to `PredictionInput`
- Update `buildFeatureMatrix` to one-hot encode event type
- Insert aspect and finBERT scores at correct positions
- Remove deprecated positive/negative count features
- Ensure feature count matches model expectations (14)

**Verification:**
- Feature matrix has exactly 14 columns
- One-hot encoding correct (one 1, rest 0s)
- Aspect/finBERT scores in correct range
- Model accepts new feature matrix

**Testing:**
- Test one-hot encoding for all event types
- Test with missing finBERT scores (fallback)
- Test with missing aspect scores (default 0)
- Verify feature order matches model training

**Estimated Tokens:** ~15,000

---

### Task 4: Retrain Prediction Model with New Features

**Goal:** Retrain the logistic regression prediction model with the new 14-feature matrix to properly utilize event type, aspect score, and DistilFinBERT sentiment.

**Files to Modify:**
- `src/ml/prediction/model.ts` - Update model coefficients
- `src/ml/prediction/cross-validation.ts` - Update training logic
- Create `scripts/train-prediction-model.py` - Training script (Python)

**Prerequisites:**
- Task 3 completed (feature matrix updated to 14 features)
- Historical stock price data available
- Historical sentiment data with new signals available
- Python scikit-learn installed for training

**Implementation Steps:**

1. **Collect Training Data**
   - Export historical data: stock prices, volumes, sentiment signals (30-90 days per ticker)
   - Minimum: 20 tickers × 60 days = 1200 data points
   - Include mix of event types, positive/negative aspects, various DistilFinBERT scores
   - Label data: next-day price movement (up=1, down=0)

2. **Create Training Script**
   - Python script using scikit-learn LogisticRegressionCV
   - Load historical data (CSV or JSON format)
   - Build 14-feature matrix matching frontend preprocessing
   - One-hot encode event types (6 features)
   - Split train/test (80/20)
   - Cross-validation with 8 folds (same as existing model)

3. **Train Model**
   - Fit LogisticRegressionCV on training data
   - Optimize regularization parameter (C) via CV
   - Evaluate on test set (accuracy, precision, recall)
   - Target: >55% accuracy (better than coin flip, reasonable for stock prediction)

4. **Extract Model Coefficients**
   - Export trained model coefficients (weights for each feature)
   - Export intercept term
   - Export scaler parameters (mean, std for each feature)
   - Format for JavaScript model

5. **Update JavaScript Model**
   - Replace hard-coded coefficients in `model.ts`
   - Update scaler parameters in `scaler.ts`
   - Ensure feature order matches exactly (critical!)
   - Document which Python model version this came from

6. **Validate JavaScript Model Matches Python**
   - Run same test data through both models
   - Compare predictions (should match to 4 decimal places)
   - Fix any numerical precision issues

7. **Performance Testing**
   - Test prediction speed (<200ms for 30-day dataset)
   - Memory usage acceptable
   - Accuracy comparable to Python model

**Verification Checklist:**
- [ ] Training script runs successfully
- [ ] Model achieves >55% test accuracy
- [ ] Coefficients exported correctly
- [ ] JavaScript model updated with new weights
- [ ] Predictions match Python model (within 0.0001)
- [ ] Prediction speed acceptable
- [ ] Documentation updated with model version and training date

**Testing Instructions:**
- Create test dataset with known outcomes
- Run Python training script
- Export coefficients
- Update JavaScript model
- Run predictions on same test data in both Python and JavaScript
- Compare results (should be identical)

**Example Training Script Structure:**
```python
# scripts/train-prediction-model.py
import pandas as pd
from sklearn.linear_model import LogisticRegressionCV
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
import json

# Load data
data = pd.read_csv('training_data.csv')

# Build feature matrix (14 features)
X = build_features(data)  # Returns 14 columns
y = data['price_up']  # Binary labels

# Split
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)

# Scale
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

# Train
model = LogisticRegressionCV(cv=8, max_iter=1000)
model.fit(X_train_scaled, y_train)

# Evaluate
accuracy = model.score(X_test_scaled, y_test)
print(f"Test Accuracy: {accuracy:.4f}")

# Export coefficients
export_to_javascript(model, scaler, 'model-v2.0.json')
```

**Commit Message Template:**
```
feat(prediction): retrain model with 14 features

- Create Python training script with historical data
- Train LogisticRegressionCV with event/aspect/finBERT signals
- Export coefficients and scaler parameters
- Update JavaScript model with new weights
- Validate predictions match Python model
- Achieve X% test accuracy on historical data

Author & Committer: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com
```

**Estimated Tokens:** ~18,000

---

### Task 5: Update Sentiment Handler API Response

**Goal:** Provide utility to backfill existing cached sentiment items with new fields (useful if retaining old cache).

**Files to Create:**
- `backend/scripts/migrate-sentiment-cache.ts` - Migration script

**Implementation:**
- Scan all sentiment cache items
- For items missing new fields:
  - Re-classify event type
  - Re-analyze aspects
  - Skip DistilFinBERT (expensive, TTL will expire old items anyway)
- Update items in place
- Progress tracking and error handling

**Note:** This is optional. TTL naturally expires old items within 30 days, so migration may not be necessary. Document that new schema will fully populate as cache refreshes.

**Estimated Tokens:** ~8,000

---

### Task 5: Update Sentiment Handler API Response

**Goal:** Expose all three signals in sentiment API response for frontend consumption.

**Files to Modify:**
- `backend/src/handlers/sentiment.handler.ts` - Update response format

**Current Response:**
```json
{
  "sentiments": [{
    "articleHash": "abc123",
    "sentiment": {
      "positive": 2,
      "negative": 1,
      "sentimentScore": 0.33,
      "classification": "POS"
    }
  }]
}
```

**New Response:**
```json
{
  "sentiments": [{
    "articleHash": "abc123",
    "eventType": "EARNINGS",
    "aspectScore": 0.45,
    "aspectBreakdown": {
      "revenue": 0.8,
      "earnings": 0.3,
      "guidance": 0.6
    },
    "distilFinBERTScore": 0.72,
    "sentiment": {
      "sentimentScore": 0.72,
      "classification": "POS"
    }
  }]
}
```

**Implementation:**
- Include all fields from SentimentCacheItem
- Optional fields: omit if not present (don't send null)
- Maintain legacy fields for backward compat
- Document API changes

**Verification:**
- API returns new fields
- Old clients using legacy fields still work
- New fields only present when data exists
- JSON structure valid

**Estimated Tokens:** ~10,000

---

### Task 7: Create Database Access Documentation

**Goal:** Document the complete sentiment data schema, access patterns, and query examples.

**Files to Create:**
- `backend/docs/database-schema.md` - Full schema documentation

**Content:**
- Table structures (all DynamoDB tables)
- SentimentCacheItem complete field reference
- Query patterns (by ticker, by date range, etc.)
- Index usage
- TTL behavior
- Migration strategy
- Example queries

**Estimated Tokens:** ~6,000

---

### Task 8: Integration Testing

**Goal:** End-to-end test of complete data flow from article to cached sentiment to prediction input.

**Files to Create:**
- `backend/src/__tests__/integration/complete-pipeline.test.ts`

**Test Flow:**
1. Process article through pipeline
2. Verify sentiment cache contains all three signals
3. Retrieve cached data
4. Build prediction features
5. Verify feature matrix correct
6. Test daily aggregation
7. Verify API response format

**Verification:**
- All signals present in cache
- Daily aggregation includes new fields
- Prediction features built correctly
- API returns complete data

**Estimated Tokens:** ~8,000

---

### Task 9: End-to-End Performance Test

**Goal:** Verify the complete sentiment analysis pipeline meets performance requirements when all three signals (event classification, aspect analysis, DistilFinBERT) are combined.

**Files to Create:**
- `backend/src/__tests__/performance/pipeline-performance.test.ts` - Performance test suite

**Prerequisites:**
- All previous Phase 4 tasks completed
- All three sentiment signals operational

**Performance Targets (from Phase success criteria):**
- Event classification: <50ms per article (Phase 1)
- Aspect analysis: <30ms per article (Phase 2)
- DistilFinBERT (cached): <200ms per article (Phase 3)
- **Combined pipeline: <500ms per article** (all three signals)
- Batch processing (10 articles): <2s total

**Implementation Steps:**

1. **Create Performance Test Suite**
   - Create test file in `__tests__/performance/`
   - Import `processSentimentForTicker` function
   - Use realistic test data (mock articles with various event types)

2. **Test Single Article Processing**
   - Process one article through complete pipeline
   - Measure time from article input to all three signals returned
   - Assert total time <500ms
   - Break down time by component (classification, aspect, finBERT)

3. **Test Batch Processing**
   - Process 10 articles through pipeline
   - Measure total time
   - Assert average time per article <500ms
   - Assert batch completes in <5s

4. **Test Material vs Non-Material Events**
   - Process earnings article (material) - includes DistilFinBERT
   - Process general news (non-material) - skips DistilFinBERT
   - Assert material event <500ms (with finBERT)
   - Assert non-material event <200ms (without finBERT)

5. **Test Cache Performance**
   - First run: cache miss (slow)
   - Second run: cache hit (fast)
   - Assert cache hit <100ms (DistilFinBERT cached)
   - Verify cache hit rate >80% after warm-up

6. **Identify Bottlenecks**
   - If tests fail, log breakdown of time per component:
     - Event classification time
     - Aspect analysis time
     - DistilFinBERT API call time
     - Database operations time
   - Identify which component exceeds target

7. **Create Performance Report**
   - Document actual timings vs targets
   - Note any components exceeding targets
   - Recommend optimizations if needed

**Verification Checklist:**
- [ ] Single article processes in <500ms
- [ ] Batch processing averages <500ms per article
- [ ] Material events include all three signals
- [ ] Non-material events skip DistilFinBERT (faster)
- [ ] Cache improves performance significantly
- [ ] No component is a severe bottleneck

**Testing Instructions:**
- Run performance tests: `npm run test:performance`
- Run multiple times to account for variance
- Test with cache cold and warm
- Document results in performance report

**Example Test:**
```typescript
describe('Pipeline Performance Tests', () => {
  it('should process single article in <500ms', async () => {
    const article = mockEarningsArticle(); // Material event

    const startTime = performance.now();
    const result = await processSentimentForTicker(
      article.ticker,
      article.date,
      article.date
    );
    const duration = performance.now() - startTime;

    expect(result.eventType).toBeDefined();
    expect(result.aspectScore).toBeDefined();
    expect(result.distilFinBERTScore).toBeDefined();
    expect(duration).toBeLessThan(500); // Target: <500ms
  });

  it('should process batch in <2s total', async () => {
    const articles = Array(10).fill(null).map(() => mockMixedArticles());

    const startTime = performance.now();
    await processBatchSentiment(articles);
    const duration = performance.now() - startTime;

    expect(duration).toBeLessThan(2000); // Target: <2s for 10 articles
  });

  it('should benefit from caching', async () => {
    const article = mockEarningsArticle();

    // First run (cache miss)
    const firstStart = performance.now();
    await processSentiment(article);
    const firstDuration = performance.now() - firstStart;

    // Second run (cache hit)
    const secondStart = performance.now();
    await processSentiment(article);
    const secondDuration = performance.now() - secondStart;

    expect(secondDuration).toBeLessThan(firstDuration * 0.5); // 50% faster with cache
    expect(secondDuration).toBeLessThan(100); // Cached should be <100ms
  });
});
```

**Commit Message Template:**
```
test(performance): add end-to-end pipeline performance tests

- Test single article processing (<500ms target)
- Test batch processing performance
- Test material vs non-material event timing
- Verify cache performance improvement
- Document performance bottlenecks if any
- Create performance benchmark baseline

Author & Committer: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com
```

**Estimated Tokens:** ~12,000

---

## Phase Verification

### Complete Checklist:
- [ ] Schema finalized and documented
- [ ] Daily aggregation includes all signals
- [ ] Prediction model receives 14 features
- [ ] API response includes event/aspect/finBERT
- [ ] Integration tests pass end-to-end
- [ ] Backward compatibility verified
- [ ] Documentation complete

### Data Validation:
```typescript
const cacheItem = await getSentiment('AAPL', 'hash123');

// Verify all signals present
expect(cacheItem.eventType).toBeDefined();
expect(cacheItem.aspectScore).toBeDefined();
expect(cacheItem.distilFinBERTScore).toBeDefined(); // If material event

// Verify ranges
expect(cacheItem.aspectScore).toBeGreaterThanOrEqual(-1);
expect(cacheItem.aspectScore).toBeLessThanOrEqual(1);
```

---

## Next Steps

Proceed to:
- [Phase 5: API Integration & Frontend Display](./Phase-5.md)
