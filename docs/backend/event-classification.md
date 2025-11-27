# Event Classification System

## Overview

The event classification system automatically categorizes financial news articles into six event types, providing the first signal in a multi-signal sentiment analysis architecture. The classifier uses rule-based keyword matching with contextual validation to achieve 85%+ accuracy on material events.

**Purpose:** Enable sophisticated sentiment analysis by routing material events (earnings, M&A, guidance, analyst ratings) to advanced processing (DistilFinBERT) while handling general news with fast bag-of-words analysis.

## Event Types

### EARNINGS (Priority: 6 - Highest)

**Definition:** Quarterly or annual earnings reports, EPS announcements, revenue results.

**Primary Keywords:**
- earnings, eps, quarterly results, annual results
- beats estimates, misses estimates, beats expectations, misses expectations
- earnings report, earnings beat, earnings miss
- profit, q1/q2/q3/q4 results, fiscal year

**Secondary Keywords:**
- revenue, sales, quarter, fiscal
- profit margin, net income, operating income, gross profit
- bottom line, top line

**Context Words:** reports, announces, posted, released, delivers

**Example Articles:**
- "Apple Reports Q1 Earnings Beat" → EARNINGS (confidence: 0.92)
- "Tesla Misses EPS Expectations Despite Revenue Growth" → EARNINGS (confidence: 0.88)

---

### M&A (Priority: 5)

**Definition:** Mergers, acquisitions, takeovers, spin-offs, divestitures.

**Primary Keywords:**
- merger, acquisition, acquires, buys, takeover, buyout
- acquired, merges, merging, consolidation
- spin-off, spinoff, divest, divestiture
- takeover bid, hostile takeover, friendly merger

**Secondary Keywords:**
- deal, purchase, combine, transaction
- acquire, bought, sale, sold, buying, selling

**Context Words:** agreement, announced, completed, closed, billion, million, $, cash, stock

**Example Articles:**
- "Microsoft Acquires AI Startup for $2B" → M&A (confidence: 0.89)
- "Google and Alphabet Complete Spin-off of X Division" → M&A (confidence: 0.85)

---

### GUIDANCE (Priority: 4)

**Definition:** Forward guidance, outlook changes, forecasts, projections.

**Primary Keywords:**
- guidance, outlook, forecast, projects, expects
- forward guidance, raises guidance, lowers guidance
- reaffirms guidance, updates guidance
- guidance cut, guidance raise

**Secondary Keywords:**
- raises, lowers, reaffirms, updates
- fy, full-year, full year, next quarter, next year
- sees, anticipates, targets

**Context Words:** revenue, earnings, growth, sales, profit, margin, expects, projected

**Negative Patterns:**
- "guidance counselor" (not financial)
- "career guidance"

**Example Articles:**
- "Tesla Raises Full-Year Guidance on Strong Demand" → GUIDANCE (confidence: 0.87)
- "Company Lowers Revenue Outlook for Q2" → GUIDANCE (confidence: 0.83)

---

### ANALYST_RATING (Priority: 3)

**Definition:** Analyst upgrades, downgrades, initiations, price target changes.

**Primary Keywords:**
- upgrade, downgrade, initiates coverage
- price target, rating, upgrades, downgrades
- initiated, maintains, reiterates
- raises target, lowers target, target price

**Secondary Keywords:**
- analyst, buy, sell, hold
- outperform, underperform, neutral
- overweight, underweight, equal weight, market perform

**Context Words:**
- Firm names: morgan stanley, goldman sachs, jpmorgan, bank of america, wells fargo, barclays, ubs, credit suisse, deutsche bank, citigroup
- analyst, firm

**Example Articles:**
- "Morgan Stanley Upgrades Stock to Buy with $200 Price Target" → ANALYST_RATING (confidence: 0.91)
- "Goldman Sachs Initiates Coverage with Neutral Rating" → ANALYST_RATING (confidence: 0.85)

---

### PRODUCT_LAUNCH (Priority: 2)

**Definition:** Product announcements, releases, unveilings.

**Primary Keywords:**
- launches, unveils, introduces, releases
- announces new, new product, product launch
- unveiling, debut, rollout

**Secondary Keywords:**
- product, service, version, model
- feature, update, device, platform, technology

**Context Words:** available, coming, revealed, presented, showcased

**Negative Patterns:**
- "product placement" (not a product launch)

**Example Articles:**
- "Apple Unveils New iPhone Model with Advanced Camera" → PRODUCT_LAUNCH (confidence: 0.84)
- "Tesla Introduces Updated Autopilot Features" → PRODUCT_LAUNCH (confidence: 0.79)

---

### GENERAL (Priority: 1 - Lowest)

**Definition:** Catch-all for news that doesn't fit other categories.

**Primary Keywords:**
- company, stock, shares, market, trading

**Secondary Keywords:**
- news, update, announcement, statement

**Example Articles:**
- "Apple CEO Speaks at Conference" → GENERAL (confidence: 0.15)
- "Stock Market Update: Shares Trade Higher" → GENERAL (confidence: 0.22)

---

## Classification Algorithm

### Process Flow

```
1. Article Input (headline + description)
   ↓
2. Text Normalization
   - Lowercase
   - Remove special characters
   - Normalize whitespace
   ↓
3. Score Against All Event Types
   - Primary keywords: 3 points each
   - Secondary keywords: 1 point each
   - Context boost: +50% if context present
   - Negative pattern: -100% (score = 0)
   ↓
4. Apply Headline/Summary Weighting
   - Headline: 3x weight
   - Summary: 1x weight
   ↓
5. Resolve Multi-Event Conflicts
   - If multiple events score >0.3, use priority
   - If all scores <0.3, classify as GENERAL
   ↓
6. Return Classification Result
```

### Priority System

When multiple event types score above threshold (0.3):

```
Priority Order (highest to lowest):
1. EARNINGS (6)
2. M&A (5)
3. GUIDANCE (4)
4. ANALYST_RATING (3)
5. PRODUCT_LAUNCH (2)
6. GENERAL (1)
```

**Example:**
```
Article: "Apple Reports Strong Earnings and Launches New iPhone"

Scores:
- EARNINGS: 0.85
- PRODUCT_LAUNCH: 0.72

Resolution: EARNINGS (higher priority)
```

### Confidence Threshold

- **High Confidence:** >0.7 (clear classification)
- **Medium Confidence:** 0.3-0.7 (acceptable classification)
- **Low Confidence:** <0.3 (defaults to GENERAL)

---

## Usage Examples

### Classify Single Article

```typescript
import { classifyEvent } from './services/eventClassification.service';
import type { NewsArticle } from './repositories/newsCache.repository';

const article: NewsArticle = {
  title: 'Apple Reports Q1 Earnings Beat',
  description: 'Apple Inc. reported earnings of $1.25 EPS, beating analyst estimates of $1.15.',
  url: 'https://example.com/article',
  date: '2025-01-15',
};

const result = await classifyEvent(article);
// {
//   eventType: 'EARNINGS',
//   confidence: 0.92,
//   matchedKeywords: ['earnings', 'eps', 'estimates']
// }
```

### Classify Batch via API

```bash
curl -X POST https://api.example.com/events/classify \
  -H "Content-Type: application/json" \
  -d '{
    "articles": [
      {
        "title": "Apple Reports Earnings Beat",
        "url": "https://example.com/1",
        "date": "2025-01-15"
      },
      {
        "title": "Microsoft Acquires Startup",
        "url": "https://example.com/2",
        "date": "2025-01-15"
      }
    ]
  }'
```

Response:
```json
{
  "classifications": [
    {
      "eventType": "EARNINGS",
      "confidence": 0.92,
      "matchedKeywords": ["earnings"],
      "articleUrl": "https://example.com/1"
    },
    {
      "eventType": "M&A",
      "confidence": 0.89,
      "matchedKeywords": ["acquires"],
      "articleUrl": "https://example.com/2"
    }
  ],
  "processingTimeMs": 45
}
```

---

## Monitoring and Metrics

### CloudWatch Metrics

The classifier logs the following metrics to CloudWatch:

**Aggregate Metrics** (every 100 classifications):
- `EventClassificationCount` - Total articles classified
- `AvgConfidence` - Average confidence score
- `AvgDurationMs` - Average processing time per article
- `MultiEventConflicts` - Number of articles with multiple high-scoring events
- `LowConfidenceCount` - Number of classifications below threshold

**Per-Classification Metrics:**
- `ClassificationDuration` - Time to classify article (ms)
- `ClassificationConfidence` - Confidence score (0-1)
- `EventTypeCount` - Count per event type

**Dimensions:**
- `Service: EventClassification`
- `EventType: EARNINGS | M&A | ...`

### Monitoring Best Practices

1. **Alert on High Error Rate**
   - Threshold: >5% low confidence classifications
   - Action: Review keywords or adjust threshold

2. **Track Performance Degradation**
   - Threshold: Average duration >100ms
   - Action: Optimize keyword matching or add caching

3. **Monitor Event Distribution**
   - Expected: 20-30% EARNINGS, 10-15% M&A, 50-60% GENERAL
   - Anomalies may indicate keyword issues

---

## Maintenance Guide

### Adding New Keywords

1. Edit `backend/src/ml/events/keywords.ts`
2. Add keyword to appropriate event type (primary or secondary)
3. Run tests: `npm test -- keywords.test.ts`
4. Validate with test fixtures

**Example:**
```typescript
EARNINGS: {
  primary: [
    // ... existing keywords
    'quarterly profit', // NEW
  ],
  // ...
}
```

### Adjusting Priority Weights

1. Edit `backend/src/types/event.types.ts`
2. Modify `EVENT_PRIORITIES` constant
3. Run tests: `npm test -- eventClassification.service.test.ts`

**Example:**
```typescript
export const EVENT_PRIORITIES: Record<EventType, number> = {
  EARNINGS: 6,
  'M&A': 5, // Changed from 4 to 5
  GUIDANCE: 4,
  // ...
};
```

### Evaluating Classification Accuracy

**Manual Testing:**
1. Create test fixtures in `backend/src/ml/events/examples/`
2. Run classification on fixtures
3. Compare results to expected classifications
4. Adjust keywords or weights as needed

**Production Monitoring:**
1. Review CloudWatch metrics weekly
2. Analyze low-confidence classifications in logs
3. Check event type distribution for anomalies
4. Update keywords based on false positives/negatives

---

## Known Limitations

### Current Limitations

1. **Rule-Based Only**
   - No machine learning adaptation
   - Cannot learn from new patterns automatically
   - Limited by keyword quality

2. **Simple Multi-Event Handling**
   - Uses priority system for conflicts
   - Cannot capture nuanced multi-topic articles
   - May misclassify articles with equal emphasis on multiple events

3. **Fixed Headline Weighting**
   - Always 3x weight for headlines
   - Not adaptive to article structure
   - May over-weight clickbait headlines

4. **Context Window Fixed**
   - 10-word window for context validation
   - Not adjustable per event type
   - May miss distant context relationships

5. **No Automatic Keyword Learning**
   - Requires manual keyword updates
   - Cannot discover new financial terminology
   - May miss emerging event patterns

### Acceptable for Phase 1

These limitations are expected and acceptable for the initial rule-based implementation. Future phases (Phase 2-3) will add:
- Aspect-based analysis (Phase 2)
- DistilFinBERT contextual understanding (Phase 3)
- ML-based event classification (future)

---

## Next Steps

After Phase 1 completion, the system will be enhanced in subsequent phases:

- **Phase 2:** Aspect-Based Analysis System (extracts financial metrics like revenue, EPS, margins)
- **Phase 3:** DistilFinBERT Integration (sophisticated sentiment for material events)
- **Phase 4:** Data Schema Updates (extend DynamoDB to store new signals)
- **Phase 5:** API Integration & Frontend Display (expose classifications to UI)

---

## Support and Feedback

For questions or issues:
- Review test fixtures in `backend/src/ml/events/__tests__/`
- Check CloudWatch logs for classification decisions
- Consult Phase-0.md for architectural decisions
- See implementation in `backend/src/services/eventClassification.service.ts`
