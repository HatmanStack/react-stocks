# Aspect-Based Sentiment Analysis

## Overview

The aspect-based sentiment analysis system provides nuanced sentiment signals by analyzing six key financial aspects in news articles. Unlike simple bag-of-words sentiment, this system captures mixed signals (e.g., "revenue beat but margins compressed") that are critical for accurate stock price predictions.

## The Six Aspects

### 1. REVENUE (Weight: 25%)
**Definition:** Top-line growth and sales performance

**Keywords:**
- Base: revenue, sales, top line
- Positive: beat, exceeded, grew, strong, up
- Negative: missed, fell, weak, declined, down

**Example:** "Apple revenue grew 15%, beating estimates" → Score: +0.8

### 2. EARNINGS (Weight: 30%)
**Definition:** Bottom-line profitability and EPS

**Keywords:**
- Base: earnings, EPS, profit, net income
- Positive: beat, exceeded, surge, strong, record
- Negative: missed, fell, loss, weak, disappointing

**Example:** "Earnings surged past expectations" → Score: +0.9

### 3. GUIDANCE (Weight: 20%)
**Definition:** Forward-looking forecasts and outlook

**Keywords:**
- Base: guidance, outlook, forecast, projects, expects
- Positive: raised, increased, upgraded, optimistic
- Negative: lowered, reduced, downgraded, cautious

**Example:** "Company raised full-year guidance" → Score: +0.7

### 4. MARGINS (Weight: 15%)
**Definition:** Profitability quality and margin expansion/compression

**Keywords:**
- Base: margin, profitability, operating margin, gross margin
- Positive: expanded, improved, grew, strong
- Negative: compressed, contracted, fell, weak

**Example:** "Operating margins compressed to 25%" → Score: -0.6

### 5. GROWTH (Weight: 5%)
**Definition:** Growth rate trends and expansion

**Keywords:**
- Base: growth, expansion, growing
- Positive: accelerating, strong, robust, rapid, double-digit
- Negative: slowing, decelerating, weak, stagnant

**Example:** "Growth is accelerating rapidly" → Score: +0.8

### 6. DEBT (Weight: 5%)
**Definition:** Debt levels and financial health (note: reduced debt = positive)

**Keywords:**
- Base: debt, leverage, borrowing, liabilities
- Positive: reduced, paid down, lowered (less debt is good)
- Negative: increased, rose, higher, concerns (more debt is bad)

**Example:** "Company reduced debt by 20%" → Score: +0.7

## Weighting Rationale

Weights are based on empirical market impact:

- **EARNINGS (30%)**: Bottom line is most critical for profitability
- **REVENUE (25%)**: Top line growth drives valuations
- **GUIDANCE (20%)**: Forward-looking signals move markets significantly
- **MARGINS (15%)**: Quality of profitability matters
- **GROWTH (5%)**: Long-term trajectory, already captured in revenue
- **DEBT (5%)**: Important for financial health but less immediate impact

**Total: 100%**

## Scoring Algorithm

### Step 1: Sentence Extraction
```
Article text → Split into sentences → Handle abbreviations (Q1, U.S., Inc.)
```

### Step 2: Aspect Detection
For each aspect:
1. Find base keywords in sentences
2. Extract surrounding words (±10 words)
3. Count positive signal words
4. Count negative signal words
5. Detect negation ("did not beat" → flip polarity)
6. Apply intensity modifiers ("significantly beat" → 1.5x)

### Step 3: Polarity Calculation
```typescript
positiveScore = Σ(positive signals × intensity)
negativeScore = Σ(negative signals × intensity)

polarity = (positiveScore - negativeScore) / max(positiveScore, negativeScore, 1)
// Range: -1 (very negative) to +1 (very positive)
```

### Step 4: Confidence Calculation
```typescript
baseConfidence = min(signalCount / 3, 1.0)
contextBoost = hasFinancialContext ? 1.2 : 1.0
confidence = min(baseConfidence × contextBoost, 1.0)
```

### Step 5: Weighted Overall Score
```typescript
weightedSum = Σ(aspectScore × aspectWeight) for detected aspects
totalWeight = Σ(aspectWeight) for detected aspects

overallScore = weightedSum / totalWeight
// Automatically renormalizes when aspects filtered by event type
```

## Event-Aspect Mapping

Different event types analyze different aspects:

| Event Type | Analyzed Aspects | Rationale |
|------------|-----------------|-----------|
| EARNINGS | All 6 | Comprehensive financial view |
| M&A | DEBT, REVENUE | Financial health for deals |
| GUIDANCE | REVENUE, EARNINGS, MARGINS | Forward-looking metrics |
| ANALYST_RATING | All 6 | Ratings consider full picture |
| PRODUCT_LAUNCH | REVENUE, GROWTH | Product impact metrics |
| GENERAL | All 6 | Unknown relevance |

## Usage Examples

### Basic Usage
```typescript
import { analyzeAspects } from './services/aspectAnalysis.service';

const article = {
  ticker: 'AAPL',
  headline: 'Apple Beats Earnings, Misses Revenue',
  summary: 'Apple reported EPS of $1.30 vs $1.20 expected, but revenue of $90B vs $92B expected.'
};

const result = await analyzeAspects(article);

console.log(result);
// {
//   overallScore: 0.15,  // Slightly positive (earnings weight > revenue weight)
//   breakdown: {
//     EARNINGS: 0.7,      // Beat → positive
//     REVENUE: -0.4       // Miss → negative
//   },
//   confidence: 0.82,
//   detectedAspects: [
//     { aspect: 'EARNINGS', score: 0.7, confidence: 0.9, text: '...' },
//     { aspect: 'REVENUE', score: -0.4, confidence: 0.75, text: '...' }
//   ]
// }
```

### With Event Type Filtering
```typescript
const result = await analyzeAspects(article, 'PRODUCT_LAUNCH');
// Only analyzes REVENUE and GROWTH (faster, focused)
```

## Integration with Sentiment Pipeline

The aspect analysis runs after event classification in the sentiment processing pipeline:

```
1. Fetch articles
2. Classify events (EARNINGS, M&A, etc.)
3. Analyze aspects (filtered by event type)  ← NEW
4. Analyze sentiment (bag-of-words or DistilFinBERT)
5. Cache results (including aspect scores)
6. Aggregate daily sentiment
```

**Performance:** <30ms per article on average

## Test Fixtures

### Positive Revenue Example
```json
{
  "ticker": "AAPL",
  "headline": "Apple Revenue Surges Past Estimates",
  "summary": "Apple reported revenue of $95B, beating analyst estimates of $92B.",
  "expectedScores": {
    "REVENUE": 0.8,
    "overallScore": 0.8
  }
}
```

### Mixed Sentiment Example
```json
{
  "ticker": "TSLA",
  "headline": "Tesla Beats Revenue But Misses EPS",
  "summary": "Tesla reported revenue growth of 20% but earnings fell short.",
  "expectedScores": {
    "REVENUE": 0.7,
    "EARNINGS": -0.5,
    "overallScore": 0.05
  }
}
```

## Common Patterns & Edge Cases

### Negation Handling
- "Revenue did **not** beat" → Negative (negation flips polarity)
- "Margins **couldn't** expand" → Negative

### Intensity Modifiers
- "Revenue **significantly** beat" → Higher positive score (1.5x)
- "Earnings **slightly** missed" → Lower negative score (0.5x)

### Context Requirements
Aspect keywords must appear with financial context words to avoid false positives:

❌ "The company's guidance counselor program..." (not financial)
✅ "Company raised guidance for Q1" (financial context)

### Headline Weighting
Headlines are weighted 2x more than summaries by repeating the headline text.

## Maintenance Guide

### Adding New Keywords
1. Update `backend/src/ml/aspects/keywords.ts`
2. Add to appropriate category (base/positive/negative/context)
3. Ensure lowercase for case-insensitive matching
4. Run tests to verify no contradictions

### Adjusting Weights
1. Update `ASPECT_WEIGHTS` in `backend/src/types/aspect.types.ts`
2. Ensure weights sum to 1.0
3. Run weight validation test
4. Document rationale in this file

### Adding New Aspects
1. Add aspect to `AspectType` enum
2. Add weight to `ASPECT_WEIGHTS`
3. Create keyword set in `ASPECT_KEYWORDS`
4. Update event-aspect mapping if needed
5. Add test fixtures

## Accuracy Evaluation

To evaluate aspect detection accuracy:

1. Create test set of 50+ articles with manual labels
2. Run aspect analysis on each
3. Calculate metrics:
   - Polarity accuracy: % correct positive/negative/neutral
   - Detection recall: % of aspects correctly identified
   - Precision: % of detected aspects that are actually present

**Target:** 90%+ polarity accuracy on clear signals

## Known Limitations

1. **Keyword-based:** May miss complex phrasings not in keyword list
2. **Proximity-based:** Can attribute signals to wrong aspects if close together
3. **No cross-aspect logic:** Doesn't understand "revenue up but margins down due to costs"
4. **Context windows:** Fixed ±10 words may miss long-range dependencies

These limitations are partially addressed by DistilFinBERT in Phase 3.

## Performance Benchmarks

- **Detection speed:** ~20-30ms per article
- **Memory usage:** <10MB for keyword libraries
- **Batch processing:** Parallel analysis of multiple articles
- **Scaling:** O(n×m) where n=articles, m=aspects (6 aspects analyzed)

## See Also

- [Phase 2 Implementation Plan](../../docs/plans/Phase-2.md)
- [ADR-003: Aspect-Based Analysis Methodology](../../docs/plans/Phase-0.md#adr-003-aspect-based-analysis-methodology)
- [Event Classification Documentation](./event-classification.md)
