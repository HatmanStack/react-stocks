# End-to-End Verification Checklist - Multi-Signal Prediction

This document outlines the manual verification steps for the Multi-Signal Stock Prediction feature.

## Prerequisites
- Backend deployed (`npm run deploy` in `backend/`)
- Frontend running (`npm start`)
- Valid `.env` configuration with `EXPO_PUBLIC_PREDICTION_API_URL`

## Test Scenarios

### 1. New Stock Selection & Prediction Display
**Goal**: Verify predictions appear for a newly selected stock.
- [ ] Open app and navigate to **Search**.
- [ ] Search for a stock (e.g., "AAPL").
- [ ] Select the stock to view details.
- [ ] **Verify**: Loading state appears for sentiment/predictions.
- [ ] **Verify**: After loading, navigate to **Sentiment** tab.
- [ ] **Verify**: "Predictions" section is visible.
- [ ] **Verify**: 1-Day, 2-Week, and 1-Month predictions are displayed (e.g., "↑ 72%").
- [ ] **Verify**: Color coding (Green for Up, Red for Down).

### 2. Portfolio Integration
**Goal**: Verify predictions appear in the portfolio list.
- [ ] Add the stock to your **Portfolio** (if not already added).
- [ ] Navigate to **Portfolio** tab.
- [ ] **Verify**: The stock item displays "Pred (1D): [Arrow] [Percentage]".
- [ ] **Verify**: Color coding matches the direction.

### 3. Smart Refresh Logic
**Goal**: Verify prediction is NOT re-triggered unnecessarily.
- [ ] Close the app or navigate away.
- [ ] Re-open the app and view the same stock.
- [ ] **Verify**: Data loads quickly (from cache).
- [ ] **Backend Log Check**: Check CloudWatch logs for `SentimentHandler`.
- [ ] **Verify**: Log should show "Skipping prediction trigger... (no new data needed)" if no new news.

### 4. Error Handling
**Goal**: Verify graceful degradation.
- [ ] (Optional) Temporarily break the backend (e.g., bad API key) or disconnect network.
- [ ] Select a stock.
- [ ] **Verify**: App does NOT crash.
- [ ] **Verify**: Sentiment/Predictions section shows "—" or error message, but other data (price) might still load if cached.

## Manual Verification Log

| Date | Tester | Scenario | Result | Notes |
|------|--------|----------|--------|-------|
|      |        | 1. New Stock |        |       |
|      |        | 2. Portfolio |        |       |
|      |        | 3. Smart Refresh |    |       |
|      |        | 4. Error Handling |   |       |

## Troubleshooting
- **No Predictions?**
  - Check CloudWatch logs for `PredictionFunction`.
  - Ensure `DailySentimentAggregate` table is populated.
  - Verify `EXPO_PUBLIC_PREDICTION_API_URL` in `.env`.
- **Wrong Colors?**
  - Check `CombinedWordItem.tsx` styling logic.
