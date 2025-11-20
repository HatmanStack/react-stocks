# Phase 5: API Integration & Frontend Display

## Phase Goal

Integrate the three-signal sentiment system with the frontend React Native application, updating UI components to display event types, aspect scores, and DistilFinBERT sentiment. Connect the new signals to the prediction model and update stock detail views.

**Success Criteria:**
- Frontend consumes new sentiment API format
- Article detail view shows event type, aspect score, DistilFinBERT sentiment
- Prediction model uses all 14 features (including 3 new signals)
- Daily sentiment chart includes aspect and finBERT trends
- UI handles missing data gracefully (old cache items, non-material events)
- Performance: sentiment data loads in <500ms
- No breaking changes to existing functionality

**Estimated Tokens:** ~95,000

---

## Prerequisites

- Phase 4 completed (API returning new fields)
- Frontend development environment setup
- Understanding of React Native and Expo Router
- Familiarity with existing UI components

---

## Tasks

### Task 1: Update API Types and Service Layer

**Goal:** Update TypeScript interfaces to match new backend API response format.

**Files to Modify:**
- `src/types/api.types.ts` - Add new sentiment response types
- `src/services/api/lambdaSentiment.service.ts` - Update response parsing

**New Types:**
```typescript
export interface SentimentAnalysisResponse {
  // Legacy fields (keep)
  positive: string[];
  negative: string[];
  neutral: string[];
  hash: string;

  // NEW fields
  eventType: EventType;
  aspectScore: number;
  aspectBreakdown?: {
    revenue?: number;
    earnings?: number;
    guidance?: number;
    margins?: number;
    growth?: number;
    debt?: number;
  };
  distilFinBERTScore?: number;
  sentimentScore: number;
  classification: 'POS' | 'NEG' | 'NEUT';
}

export type EventType =
  | 'EARNINGS'
  | 'M&A'
  | 'PRODUCT_LAUNCH'
  | 'ANALYST_RATING'
  | 'GUIDANCE'
  | 'GENERAL';
```

**Implementation:**
- Update all interfaces
- Add type guards for optional fields
- Update API response parsing
- Handle backward compat (old responses)

**Verification:**
- Types compile
- API calls return correctly typed data
- Type guards work
- Old data doesn't break parsing

**Estimated Tokens:** ~8,000

---

### Task 2: Update Sentiment Data Repository/Hook

**Goal:** Update sentiment data fetching hook to retrieve and expose new fields.

**Files to Modify:**
- `src/hooks/useSentimentData.ts` - Update data fetching
- `src/database/repositories/wordCount.repository.ts` - Update DB schema if needed

**Implementation:**
- Fetch new fields from backend/cache
- Store eventType, aspectScore, finBERTScore in database
- Expose via hook return value
- Handle missing fields (default values)

**Example Hook Return:**
```typescript
const {
  sentimentData,     // Legacy positive/negative counts
  eventType,         // NEW
  aspectScore,       // NEW
  aspectBreakdown,   // NEW (optional)
  finBERTScore,      // NEW (optional)
  isLoading,
  error
} = useSentimentData(ticker, days);
```

**Verification:**
- Hook returns new fields
- Data persists to local database
- Missing fields handled gracefully
- Loading states work correctly

**Estimated Tokens:** ~10,000

---

### Task 3: Update Article Detail UI Component

**Goal:** Enhance article sentiment display to show event type, aspect score, and DistilFinBERT sentiment.

**Files to Modify:**
- `src/components/stock/ArticleSentimentCard.tsx` (or similar component)

**Current UI:**
```
Nov 19
Autonomous vehicle company Zoox...
Positive: 2
Negative: 1
Score: 0.33
```

**New UI:**
```
Nov 19
Autonomous vehicle company Zoox...

Event: Earnings Report
Aspect Score: +0.45 (Mixed Positive)
  ↳ Revenue: +0.8  |  Earnings: +0.3  |  Guidance: +0.6

DistilFinBERT: +0.72 (Strong Positive)

Overall Sentiment: Positive (+0.72)
```

**Implementation:**
- Add event type badge/chip (color-coded)
- Display aspect score with breakdown (expandable)
- Show DistilFinBERT score (if present)
- Keep legacy positive/negative counts (collapsed/optional)
- Handle missing finBERT (non-material events)
- Add tooltips explaining each metric

**Design Guidelines:**
- Event types: color-coded (Earnings=blue, M&A=purple, etc.)
- Aspect score: gradient -1 (red) to +1 (green)
- FinBERT score: prominent display (most accurate signal)
- Breakdown: collapsible for space efficiency

**Verification:**
- All event types display correctly
- Aspect breakdown expands/collapses
- Missing finBERT handled (shows "N/A" or hidden)
- Colors intuitive (red=negative, green=positive)
- Responsive on mobile and web

**Estimated Tokens:** ~15,000

---

### Task 4: Update Daily Sentiment Chart

**Goal:** Add aspect score and DistilFinBERT score trend lines to existing sentiment chart.

**Files to Modify:**
- `src/components/charts/SentimentChart.tsx` (or equivalent)
- `src/hooks/useSentimentData.ts` - Aggregate daily averages

**Current Chart:**
- Single line: Daily sentiment score

**New Chart:**
- Line 1: Legacy sentiment (keep for comparison)
- Line 2: Daily average aspect score (green/red)
- Line 3: Daily average DistilFinBERT score (blue) - only material events
- Legend toggle: show/hide each line

**Implementation:**
- Calculate daily averages for aspect and finBERT
- Add two new data series to chart
- Color-code lines for clarity
- Add legend with toggles
- Handle days with no material events (finBERT line gaps)

**Verification:**
- All three lines visible
- Toggle works (hide/show lines)
- Gaps in finBERT line handled (not days with no material events)
- Chart scales properly with multiple series
- Performance: renders smoothly with 30 days data

**Estimated Tokens:** ~12,000

---

### Task 5: Update Prediction Model Integration

**Goal:** Feed new sentiment signals (event type, aspect score, finBERT score) into prediction model.

**Files to Modify:**
- `src/ml/prediction/preprocessing.ts` - Add new features to feature matrix
- `src/hooks/usePredictions.ts` - Pass new data to prediction function

**Current Prediction Input:**
```typescript
getStockPredictions(
  ticker,
  closePrices,
  volumes,
  positiveCounts,  // DEPRECATED
  negativeCounts,  // DEPRECATED
  sentimentScores
)
```

**New Prediction Input:**
```typescript
getStockPredictions(
  ticker,
  closePrices,
  volumes,
  eventTypes,      // NEW: array of EventType per day
  aspectScores,    // NEW: array of aspect scores per day
  finBERTScores,   // NEW: array of finBERT scores per day
  sentimentScores  // Keep for backward compat
)
```

**Implementation:**
- Extract eventType, aspectScore, finBERTScore from daily sentiment
- One-hot encode event types (see Phase 4 Task 3)
- Build 14-feature matrix
- Pass to logistic regression model
- Handle missing finBERT scores (use sentiment score as fallback)

**Verification:**
- Feature matrix has 14 columns
- Predictions still generated
- Accuracy improves with new features (test with historical data)
- No errors with missing data

**Testing:**
- Unit test feature matrix construction
- Integration test full prediction pipeline
- Compare predictions before/after (expect better accuracy)

**Estimated Tokens:** ~18,000

---

### Task 6: Add Event Type Filtering

**Goal:** Allow users to filter news by event type in the sentiment tab.

**Files to Modify:**
- `src/screens/(tabs)/stock/[ticker]/sentiment.tsx` - Add filter UI
- `src/hooks/useSentimentData.ts` - Add filtering logic

**UI Design:**
- Filter chips: [All] [Earnings] [M&A] [Guidance] [Analyst Rating] [Product] [General]
- Multi-select or single-select
- Show count per event type
- Default: All

**Implementation:**
- Add filter state (selected event types)
- Filter sentiment data by event type
- Update UI to show only selected types
- Persist filter selection to AsyncStorage

**Verification:**
- Filtering works correctly
- Counts accurate
- Filter persists across sessions
- Clear filter button works

**Estimated Tokens:** ~10,000

---

### Task 7: Handle Backward Compatibility

**Goal:** Ensure app works with both old and new cached sentiment data during transition period.

**Files to Modify:**
- All components displaying sentiment data

**Implementation:**
- Check for presence of new fields before rendering
- Fallback to legacy fields if new fields missing
- Display partial UI if some fields missing
- Log warnings for missing expected fields (debugging)

**Example:**
```typescript
// Graceful degradation
const displayEventType = sentimentData.eventType ?? 'UNKNOWN';
const displayAspectScore = sentimentData.aspectScore ?? 0;
const displayFinBERT = sentimentData.distilFinBERTScore ?? sentimentData.sentimentScore;
```

**Verification:**
- App doesn't crash with old data
- New features hidden when data missing
- Transition smooth as cache refreshes

**Estimated Tokens:** ~8,000

---

### Task 8: Update User Documentation

**Goal:** Document new sentiment features for users in app help/info section.

**Files to Modify/Create:**
- `docs/user-guide/sentiment-analysis.md` - User-facing documentation
- In-app help text for sentiment tab

**Content:**
- Explain three-signal system in user-friendly terms
- Define event types with examples
- Explain aspect scores (what each aspect means)
- Explain DistilFinBERT vs simple sentiment
- Guide for interpreting mixed signals

**Example Help Text:**
```
Event Type: Categorizes the news (Earnings, M&A, etc.)

Aspect Score: Analyzes specific financial metrics
- Revenue: Sales performance
- Earnings: Profitability
- Guidance: Future outlook

DistilFinBERT: Advanced AI sentiment (most accurate)
- Only for major news events
- Considers full context of language
```

**Estimated Tokens:** ~6,000

---

### Task 9: Performance Optimization

**Goal:** Ensure sentiment data loading and rendering remains fast with additional complexity.

**Implementation:**
- Lazy load aspect breakdown (only when expanded)
- Cache parsed sentiment data in memory
- Debounce chart updates
- Paginate article list if many articles
- Use React.memo for sentiment components

**Verification:**
- Sentiment tab loads in <500ms
- Chart renders smoothly
- No jank when scrolling articles
- Memory usage acceptable

**Estimated Tokens:** ~8,000

---

## Phase Verification

### End-to-End Test:

1. **View Article Sentiment:**
   - Open stock detail → Sentiment tab
   - Verify article shows event type, aspect score, finBERT score
   - Expand aspect breakdown
   - Check all values make sense

2. **View Daily Chart:**
   - Verify three lines visible
   - Toggle lines on/off
   - Check trends match expectations

3. **Test Predictions:**
   - Navigate to Portfolio tab
   - Verify predictions include new signals
   - Check prediction values reasonable

4. **Test Filtering:**
   - Filter by Earnings events
   - Verify only earnings articles shown
   - Clear filter

5. **Test Backward Compat:**
   - Clear app cache
   - Reload with old cached data
   - Verify no crashes
   - Verify graceful degradation

### Performance Benchmarks:
- Sentiment tab load: <500ms
- Chart render: <100ms
- Article scroll: 60fps
- Prediction calculation: <200ms

---

## Known Limitations

- First load after update requires cache refresh (shows partial data)
- Aspect breakdown only available for articles with detected aspects
- DistilFinBERT only for material events (some articles won't have it)
- Event classification limited by keyword quality

---

## Rollout Strategy

1. **Phase 5.1:** Backend deployed, new fields available
2. **Phase 5.2:** Frontend updated, backward compatible
3. **Phase 5.3:** Cache naturally refreshes over 7-30 days
4. **Phase 5.4:** Monitor user feedback, iterate on UI
5. **Phase 5.5:** Remove legacy fields (after all cache refreshed)

---

## PLAN_COMPLETE

All five phases documented. Implementation can begin with Phase 1.
