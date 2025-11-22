# Multi-Signal Stock Prediction Model - Brainstorm Session

## Feature Idea

In the sentiment tab on the Daily Aggregate screen, we should be running a multivariate logistic regression with datapoints from price, event classification, aspect, and FinBERT sentiment. We should be projecting out the next day, two weeks, and month for stock movement based on the history of news articles that we have.

---

## Clarifying Questions & Answers

### Q1: Where should this new prediction model fit in the architecture?

**Options:**
- A. Replace existing prediction model
- B. Run alongside existing model
- C. Sentiment-tab only feature
- D. Gradual migration

**Answer:** We're running this in the portfolio and in the sentiment tab. The bag-of-words is going away.

**Decision:** Replace the existing bag-of-words prediction model. Run in both portfolio and sentiment tab.

---

### Q2: Where should the prediction model run?

**Options:**
- A. Browser-based (like current model)
- B. Lambda-based (like sentiment analysis)
- C. Hybrid approach
- D. Lambda with aggressive caching

**Answer:** B

**Decision:** Lambda-based with asynchronous processing and polling

---

### Q3: How should we encode Event Classification for the regression model?

Event types are categorical (EARNINGS, M&A, GUIDANCE, ANALYST_RATING, PRODUCT_LAUNCH, GENERAL).

**Options:**
- A. One-hot encoding (6 binary features)
- B. Event counts (from DailySentiment)
- C. Materiality score (weighted by EVENT_PRIORITIES)
- D. Dominant event only

**Answer:** A, the event classifier is still being built so make these categories easy to change

**Decision:** One-hot encoding with flexibility for category changes

---

### Q4: What's the prediction granularity and training window?

**Initial Question:** When a user views sentiment tab with 30 days of history:

**Options:**
- A. Rolling window - predict for each historical day
- B. Single latest prediction - use all history to predict from today
- C. Both - historical + current prediction
- D. Per-article aggregation

**Initial Answer:** A

**Clarification:** I misunderstood - UI should only see the single latest prediction (next day, 2 weeks, 1 month from today). The question was about calculation/training methodology.

**Re-asked Question:** How should the model be trained to generate that single latest prediction?

**Options:**
- A. Train on all available history
- B. Fixed training window (e.g., last 30 days)
- C. Expanding window
- D. Cross-validation approach

**Answer:** A

**Decision:**
- **UI Display:** Show only single latest prediction
- **Training:** Train on all available historical data

---

### Q5: Which price features should we include in the model?

**Options:**
- A. Basic OHLCV (5 features)
- B. Returns & volatility (technical indicators)
- C. Fundamental ratios (PE, PB, trailing PEG, market cap)
- D. Comprehensive (all of the above)
- E. Custom selection

**Answer:** We need to do some F-testing here. For now just use the Basic OHLCV and then we'll expand and figure out which feature is important to keep the model fast.

**Decision:** Start with Basic OHLCV (5 features), then F-testing to optimize

---

### Q6: How should we use Aspect Analysis data in the model?

**Options:**
- A. Overall aspect score only (single feature)
- B. Individual aspect scores (REVENUE, EARNINGS, GUIDANCE, etc.)
- C. Both overall + individual
- D. Top aspects only (sparse features)

**Answer:** A

**Decision:** Overall aspectScore only (1 feature, -1 to +1 range)

---

### Q7: Which sentiment score should we use from the FinBERT analysis?

**Options:**
- A. distilFinBERTScore only (0 fallback for non-material)
- B. Legacy sentimentScore (bag-of-words)
- C. Hybrid (distilFinBERT when available, fallback to legacy)
- D. Both as separate features

**Answer:** A

**Decision:** distilFinBERTScore only, with 0 fallback for non-material events

---

### Q8: What should the model predict (target variable)?

**Options:**
- A. Binary classification (up or down)
- B. Price direction with threshold (ignore small movements)
- C. Probability score (continuous 0-1)
- D. Price change magnitude (regression)

**Answer:** For now Binary, with a probability of that Binary score.

**Decision:** Binary classification (up/down) with probability scores from logistic regression

---

### Q9: What's the threshold for classifying "up" vs "down"?

**Options:**
- A. Any positive movement (>0%)
- B. Small threshold (>1% up, <-1% down, ignore ±1%)
- C. Moderate threshold (>2%)
- D. Adaptive threshold (different per horizon)

**Answer:** B

**Decision:** >1% = up (1), <-1% = down (0), ±1% range excluded from training as noise

---

### Q10: What's the minimum data requirement to generate predictions?

**Options:**
- A. 14 days
- B. 30 days
- C. 60 days
- D. 90 days

**Answer:** B

**Decision:** 30 days minimum historical data required

---

### Q11: How should predictions be displayed in the UI?

**Options:**
- A. Simple card with 3 predictions (next day/2wks/month with probabilities)
- B. Visual gauge/meter (color-coded confidence)
- C. Chart integration (prediction markers on sentiment chart)
- D. Detailed breakdown (with feature contributions)

**Answer:** A something already exists in the sentiment daily aggregate tab for this. The same design for the portfolio would be good.

**Decision:**
- **Sentiment Tab:** Update existing predictions section in CombinedWordItem to show direction (↑/↓) + probability
- **Portfolio:** Add similar predictions section to PortfolioItem
- **Format:** "↑ 72%" or "↓ 38%" instead of current percentage returns

---

### Q12: When should predictions be computed?

**Options:**
- A. On-demand (when user views tab)
- B. Pre-computed on sync (when stock data syncs)
- C. Scheduled batch (daily cron for portfolio stocks)
- D. Hybrid (pre-compute on sync, allow manual refresh)

**Answer:** B

**Decision:** Pre-computed during stock sync, automatically triggered alongside sentiment analysis

---

### Q13: Where should prediction results be stored?

**Options:**
- A. DynamoDB only
- B. Local database only
- C. Both (DynamoDB + Local)
- D. DynamoDB cache + API response

**Answer:** Follow the same framework as our other data strategies

**Decision:** Follow existing sentiment pattern:
- Lambda computes predictions (optional DynamoDB caching for performance)
- Results returned via API/polling
- Frontend stores in local database (`combined_word_count_details` and `portfolio_details` tables)
- UI reads from local database via repositories and React Query

---

### Q14: What's the cache TTL and recomputation strategy?

**Options:**
- A. Daily refresh (24 hour TTL)
- B. Sync-based refresh (recompute every sync)
- C. Smart refresh (only if new news articles)
- D. Configurable TTL (different for market hours)

**Answer:** C

**Decision:** Smart refresh - only recompute predictions if new news articles exist since last prediction

---

### Q15: What should happen when predictions fail or are unavailable?

**Options:**
- A. Show placeholder ("—" or "N/A")
- B. Show with warning (outdated indicator)
- C. Fallback to zero (0% probability)
- D. Hide section entirely

**Answer:** A

**Decision:** Show placeholder ("—" or "N/A") when predictions unavailable or computation fails

---

## Feature Summary

### Core Design
- **Purpose:** Replace bag-of-words prediction with multi-signal logistic regression
- **Display Locations:** Sentiment tab (aggregate view) and Portfolio
- **Infrastructure:** Lambda-based with async processing

### Model Architecture

**Features (13 total):**
1. **Price:** OHLCV (5 features: open, high, low, close, volume)
2. **Event:** One-hot encoded (6 binary features: EARNINGS, M&A, GUIDANCE, ANALYST_RATING, PRODUCT_LAUNCH, GENERAL)
3. **Aspect:** Overall aspectScore (1 feature)
4. **Sentiment:** distilFinBERTScore (1 feature, 0 for non-material events)

**Target Variable:**
- Binary classification: up (1) or down (0)
- Threshold: >1% = up, <-1% = down, ±1% excluded as noise
- Output: Binary prediction + probability score

**Training:**
- Train on all available historical data
- Minimum requirement: 30 days
- Three time horizons: next day, 2 weeks, 1 month

### Data Flow

**Trigger:** Pre-computed during stock sync

**Storage Pattern:**
1. Lambda computes predictions
2. Optional DynamoDB caching (performance optimization)
3. Results returned to frontend via API
4. Frontend stores in local database tables
5. UI reads from local database via React Query

**Refresh Strategy:** Smart refresh - only recompute if new news articles detected

### UI/UX

**Display Format:**
- Direction indicator: ↑ (up) or ↓ (down)
- Probability percentage: e.g., "↑ 72%" or "↓ 38%"
- Three predictions shown: 1-Day, 2-Weeks, 1-Month

**Error Handling:**
- Show "—" or "N/A" when predictions unavailable
- No error messages, just placeholder

**Locations:**
1. **Sentiment Tab (Daily Aggregate):** Update existing predictions section in CombinedWordItem component
2. **Portfolio:** Add new predictions section to PortfolioItem component (currently not showing predictions)

### Future Optimization

**Phase 5 - F-Testing:**
- Start with Basic OHLCV (5 features)
- Run F-tests to identify important features
- Expand feature set based on statistical significance
- Goal: Optimal accuracy while keeping model fast

---

## Technical Decisions

### Why Lambda over Browser-Based?
- Better performance for ML workloads
- Can cache results across users in DynamoDB
- Asynchronous processing acceptable for <30s computation
- Consistent with existing sentiment architecture

### Why One-Hot Encoding for Events?
- Event classifier still being built
- Easy to add/remove categories
- Standard approach for categorical variables in regression
- No assumptions about ordinal relationships between event types

### Why Smart Refresh?
- Predictions depend on news sentiment data
- No point recomputing if no new articles
- More efficient, saves Lambda compute costs
- Still allows manual refresh if user wants

### Why 30 Days Minimum?
- Balanced between reliability and availability
- Sufficient data for logistic regression training
- Matches typical analysis window for stocks
- Not too restrictive (faster initial availability)

### Why >1% Threshold?
- Filters out market noise and small fluctuations
- Focuses on meaningful price movements
- ±1% range common for daily volatility
- Excludes ambiguous cases from training

---

## Out of Scope

- Historical predictions display (only latest prediction shown in UI)
- Feature importance visualization (may add in Phase 5)
- Model performance metrics in UI (logged, not displayed)
- Real-time updates (predictions cached, updated on sync)
- Custom time horizon selection (fixed: 1 day, 2 weeks, 1 month)
- Individual article predictions (only daily aggregate)
