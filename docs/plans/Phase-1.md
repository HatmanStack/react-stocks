# Phase 1: Event Classification System

## Phase Goal

Build a rule-based event classification system that categorizes financial news articles into six event types: EARNINGS, M&A, PRODUCT_LAUNCH, ANALYST_RATING, GUIDANCE, and GENERAL. The classifier uses keyword matching with contextual validation to achieve ~85%+ accuracy, providing the first signal for the multi-signal sentiment architecture.

**Success Criteria:**
- Event classifier correctly categorizes 85%+ of test articles
- Classifier processes articles in <50ms average
- All six event types have comprehensive keyword coverage
- Ambiguous articles default to highest-priority event type
- Full test coverage (unit + integration tests)

**Estimated Tokens:** ~95,000

---

## Prerequisites

- Phase 0 reviewed and understood
- Backend development environment setup (Node.js 20+, TypeScript 5.6+)
- Jest testing framework configured
- Familiarity with repository pattern and service layer architecture

---

## Tasks

### Task 1: Define Event Type System

**Goal:** Create TypeScript types and constants for the event classification system that will be used across all phases.

**Files to Create:**
- `backend/src/types/event.types.ts` - Event type definitions, constants, and utility types

**Prerequisites:**
- Understanding of TypeScript discriminated unions
- Review of Phase-0 ADR-001 (Three-Signal Architecture)

**Implementation Steps:**

1. **Define Event Type Enum**
   - Create a union type for the six event categories
   - Ensure type safety for event comparisons
   - Include JSDoc comments explaining each type's purpose

2. **Define Event Metadata Interface**
   - Structure to hold classification results
   - Include confidence score for classification
   - Add matched keywords for debugging/explainability

3. **Create Event Priority Mapping**
   - Define priority order for conflict resolution (see Phase-0 Common Pitfalls #1)
   - EARNINGS > M&A > GUIDANCE > ANALYST_RATING > PRODUCT_LAUNCH > GENERAL

4. **Define Event Keywords Structure**
   - Type-safe structure for keyword sets per event type
   - Support for headline vs summary keyword weighting
   - Include contextual requirement flags

**Verification Checklist:**
- [ ] `EventType` union type defined with all 6 values
- [ ] `EventClassificationResult` interface includes eventType, confidence, and matchedKeywords
- [ ] `EVENT_PRIORITIES` constant maps each event type to priority number (1-6)
- [ ] All types exported and documented with JSDoc

**Testing Instructions:**
- Type-only module, no runtime tests needed
- Verify TypeScript compilation: `npm run type-check`
- Ensure types are importable in other modules

**Commit Message Template:**
```
feat(event-classifier): define event type system

- Add EventType union with 6 event categories
- Define EventClassificationResult interface
- Create priority mapping for conflict resolution
- Add comprehensive JSDoc documentation

Author & Committer: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com
```

**Estimated Tokens:** ~3,000

---

### Task 2: Create Event Keyword Library

**Goal:** Build comprehensive keyword sets for each event type that will power the classification algorithm.

**Files to Create:**
- `backend/src/ml/events/keywords.ts` - Keyword definitions for all event types

**Prerequisites:**
- Task 1 completed (event types defined)
- Understanding of financial news terminology
- Review of Phase-0 Common Pitfall #2 (False Positives)

**Implementation Steps:**

1. **Structure Keyword Data**
   - Create hierarchical keyword structure: `EventKeywords` type
   - Separate primary keywords (strong signals) from secondary keywords (weak signals)
   - Include context requirements (words that must appear nearby)

2. **Define Earnings Keywords**
   - Primary: "earnings", "EPS", "quarterly results", "beats estimates", "misses expectations"
   - Secondary: "revenue", "profit", "quarter", "Q1", "Q2", "Q3", "Q4", "fiscal"
   - Context: "reports", "announces", "posted", "released"
   - Include common variations and abbreviations

3. **Define M&A Keywords**
   - Primary: "merger", "acquisition", "acquires", "buys", "takeover", "buyout"
   - Secondary: "deal", "purchase", "combine", "consolidation", "spin-off", "divest"
   - Context: "agreement", "announced", "completed", "$" (dollar amounts often present)

4. **Define Product Launch Keywords**
   - Primary: "launches", "unveils", "introduces", "releases", "announces new"
   - Secondary: "product", "service", "version", "model", "feature", "update"
   - Context: "available", "coming", "debut"

5. **Define Analyst Rating Keywords**
   - Primary: "upgrade", "downgrade", "initiates coverage", "price target", "rating"
   - Secondary: "analyst", "buy", "sell", "hold", "outperform", "underperform"
   - Context: firm names ("Morgan Stanley", "Goldman Sachs", etc.)

6. **Define Guidance Keywords**
   - Primary: "guidance", "outlook", "forecast", "projects", "expects"
   - Secondary: "raises", "lowers", "reaffirms", "FY", "full-year", "next quarter"
   - Context: "revenue", "earnings", "growth", "sales"

7. **Define Negative Patterns (Exclusions)**
   - Phrases that should NOT trigger classifications (false positives)
   - Example: "guidance counselor" (not financial guidance)
   - Example: "product placement" (not product launch)

**Verification Checklist:**
- [ ] All 6 event types have keyword sets defined
- [ ] Each event has primary, secondary, and context keywords
- [ ] Keywords are lowercase for case-insensitive matching
- [ ] Negative patterns defined to prevent false positives
- [ ] Keywords exported as typed constant

**Testing Instructions:**
- Create `backend/src/ml/events/__tests__/keywords.test.ts`
- Verify keyword sets are non-empty
- Test for duplicate keywords across event types (warn if overlap detected)
- Validate structure matches `EventKeywords` type

**Example Test:**
```typescript
import { EVENT_KEYWORDS } from '../keywords';

describe('Event Keywords', () => {
  it('should have keywords for all event types', () => {
    expect(EVENT_KEYWORDS.EARNINGS.primary.length).toBeGreaterThan(0);
    expect(EVENT_KEYWORDS.M&A.primary.length).toBeGreaterThan(0);
    // ... test all 6
  });

  it('should not have significant keyword overlap', () => {
    const earningsSet = new Set(EVENT_KEYWORDS.EARNINGS.primary);
    const m&aSet = new Set(EVENT_KEYWORDS.M&A.primary);
    const overlap = [...earningsSet].filter(k => m&aSet.has(k));

    expect(overlap.length).toBeLessThan(3); // Allow minor overlap
  });
});
```

**Commit Message Template:**
```
feat(event-classifier): add comprehensive keyword library

- Define keyword sets for all 6 event types
- Separate primary, secondary, and context keywords
- Add negative patterns to prevent false positives
- Include tests for keyword validation

Author & Committer: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com
```

**Estimated Tokens:** ~8,000

---

### Task 3: Implement Keyword Matching Algorithm

**Goal:** Build the core matching logic that scores articles against keyword sets and handles contextual requirements.

**Files to Create:**
- `backend/src/ml/events/matcher.ts` - Keyword matching and scoring functions
- `backend/src/ml/events/__tests__/matcher.test.ts` - Unit tests for matcher

**Prerequisites:**
- Task 1 & 2 completed
- Understanding of text processing (tokenization, normalization)

**Implementation Steps:**

1. **Create Text Normalization Function**
   - Convert to lowercase
   - Remove special characters (keep alphanumeric, spaces, hyphens)
   - Handle common abbreviations (EPS → earnings per share)
   - Preserve sentence structure for context checking

2. **Implement Keyword Matching Function**
   - Input: normalized text, keyword list
   - Output: match count and matched keyword array
   - Handle multi-word keywords ("price target", "beats estimates")
   - Use word boundary matching (avoid partial matches: "beat" shouldn't match "beats")

3. **Implement Context Validation**
   - Check if context keywords appear within N words of primary keywords
   - Default window size: 10 words before/after
   - Return boolean: context satisfied or not

4. **Create Event Scoring Function**
   - Score = (primary matches × 3) + (secondary matches × 1)
   - Boost score if context keywords present (+50%)
   - Apply penalties if negative patterns detected (-100% = zero score)
   - Normalize score to 0-1 range for confidence

5. **Handle Edge Cases**
   - Empty articles → GENERAL with 0 confidence
   - Single-word articles → GENERAL with 0 confidence
   - Articles with only stop words → GENERAL with 0 confidence

**Verification Checklist:**
- [ ] `normalizeText(text)` returns cleaned, lowercase string
- [ ] `matchKeywords(text, keywords)` returns match count and matched terms
- [ ] `validateContext(text, keyword, contextWords)` checks proximity
- [ ] `scoreEvent(text, eventKeywords)` returns 0-1 confidence score
- [ ] Edge cases handled without errors

**Testing Instructions:**
- Test normalization with various inputs (special chars, mixed case, unicode)
- Test keyword matching with exact matches, partial matches, multi-word
- Test context validation with different window sizes
- Test scoring with real article snippets (use fixtures)
- Test edge cases (empty, null, very long text)

**Example Tests:**
```typescript
import { normalizeText, matchKeywords, scoreEvent } from '../matcher';
import { EVENT_KEYWORDS } from '../keywords';

describe('Text Normalization', () => {
  it('should convert to lowercase and remove special chars', () => {
    const input = "Apple's Q1 Earnings: $1.25 EPS!";
    const result = normalizeText(input);

    expect(result).toBe("apples q1 earnings 125 eps");
  });
});

describe('Keyword Matching', () => {
  it('should match multi-word keywords', () => {
    const text = "company beats estimates with strong revenue";
    const keywords = ["beats estimates", "revenue"];
    const result = matchKeywords(text, keywords);

    expect(result.matchCount).toBe(2);
    expect(result.matched).toContain("beats estimates");
  });

  it('should not match partial words', () => {
    const text = "the beating heart of the business";
    const keywords = ["beat"];
    const result = matchKeywords(text, keywords);

    expect(result.matchCount).toBe(0); // "beating" !== "beat"
  });
});

describe('Event Scoring', () => {
  it('should give high score for earnings article', () => {
    const text = "Apple reported Q1 earnings of $1.25 EPS, beating analyst estimates";
    const score = scoreEvent(text, EVENT_KEYWORDS.EARNINGS);

    expect(score).toBeGreaterThan(0.7); // High confidence
  });

  it('should apply context boost', () => {
    const withContext = "Company announces strong guidance for Q2 earnings";
    const withoutContext = "guidance"; // Just the word alone

    const scoreWith = scoreEvent(withContext, EVENT_KEYWORDS.GUIDANCE);
    const scoreWithout = scoreEvent(withoutContext, EVENT_KEYWORDS.GUIDANCE);

    expect(scoreWith).toBeGreaterThan(scoreWithout);
  });
});
```

**Commit Message Template:**
```
feat(event-classifier): implement keyword matching algorithm

- Add text normalization with special char handling
- Implement multi-word keyword matching with word boundaries
- Add context validation with configurable window size
- Create event scoring with primary/secondary weighting
- Include comprehensive unit tests

Author & Committer: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com
```

**Estimated Tokens:** ~12,000

---

### Task 4: Build Event Classification Service

**Goal:** Create the main classification service that orchestrates keyword matching and resolves conflicts when multiple events are detected.

**Files to Create:**
- `backend/src/services/eventClassification.service.ts` - Main classification service
- `backend/src/services/__tests__/eventClassification.service.test.ts` - Service tests

**Prerequisites:**
- Tasks 1, 2, 3 completed
- Review of Phase-0 ADR-001 (conflict resolution via priority)

**Implementation Steps:**

1. **Define Service Interface**
   - Input: `NewsArticle` (headline + summary)
   - Output: `EventClassificationResult` (eventType, confidence, matchedKeywords)
   - Async function to support future ML model integration

2. **Implement Article Preprocessing**
   - Extract and combine headline + summary
   - Weight headline matches higher (3x) than summary matches
   - Normalize combined text for matching

3. **Score All Event Types**
   - Run keyword matcher against all 6 event types
   - Collect scores for each event type
   - Track which keywords matched for explainability

4. **Resolve Multi-Event Conflicts**
   - If multiple events score >0.3, use priority system (Phase-0 ADR-001)
   - If scores are very close (<0.1 difference), choose higher priority
   - If all scores <0.3, classify as GENERAL

5. **Handle Ambiguous Cases**
   - Articles mentioning multiple events: choose highest priority
   - Articles with low confidence (<0.3): GENERAL
   - Articles with only generic financial terms: GENERAL

6. **Add Logging for Debugging**
   - Log classification results at debug level
   - Log conflicts and resolution decisions
   - Log unexpected patterns (all scores near zero, multiple high scores)

**Verification Checklist:**
- [ ] `classifyEvent(article)` returns EventClassificationResult
- [ ] Headline weighted 3x more than summary
- [ ] Multi-event conflicts resolved via priority
- [ ] Low-confidence articles default to GENERAL
- [ ] Matched keywords included in result for debugging
- [ ] Logging includes ticker, event type, confidence

**Testing Instructions:**
- Create fixtures for all 6 event types (use realistic article examples)
- Test single-event articles (should get high confidence)
- Test multi-event articles (should resolve to highest priority)
- Test ambiguous articles (should default to GENERAL)
- Test edge cases (empty, very short, generic news)

**Example Tests:**
```typescript
import { classifyEvent } from '../eventClassification.service';

describe('Event Classification Service', () => {
  describe('Single Event Articles', () => {
    it('should classify earnings article', async () => {
      const article = {
        ticker: 'AAPL',
        headline: 'Apple Reports Q1 Earnings Beat',
        summary: 'Apple Inc. reported earnings of $1.25 EPS, beating estimates of $1.15.',
        // ... other fields
      };

      const result = await classifyEvent(article);

      expect(result.eventType).toBe('EARNINGS');
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.matchedKeywords).toContain('earnings');
    });

    it('should classify M&A article', async () => {
      const article = {
        ticker: 'MSFT',
        headline: 'Microsoft Acquires AI Startup for $2B',
        summary: 'Microsoft announced the acquisition of AI company...',
      };

      const result = await classifyEvent(article);

      expect(result.eventType).toBe('M&A');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    // ... tests for other 4 event types
  });

  describe('Multi-Event Articles', () => {
    it('should prioritize earnings over product launch', async () => {
      const article = {
        ticker: 'AAPL',
        headline: 'Apple Launches iPhone After Strong Earnings',
        summary: 'Following Q1 earnings beat, Apple unveiled new iPhone...',
      };

      const result = await classifyEvent(article);

      // EARNINGS has higher priority than PRODUCT_LAUNCH
      expect(result.eventType).toBe('EARNINGS');
    });

    it('should prioritize M&A over analyst rating', async () => {
      const article = {
        ticker: 'GOOGL',
        headline: 'Google Acquisition Earns Analyst Upgrade',
        summary: 'Following the $5B acquisition, Morgan Stanley upgraded...',
      };

      const result = await classifyEvent(article);

      expect(result.eventType).toBe('M&A');
    });
  });

  describe('Ambiguous Articles', () => {
    it('should default to GENERAL for generic news', async () => {
      const article = {
        ticker: 'AAPL',
        headline: 'Apple CEO Speaks at Conference',
        summary: 'Tim Cook discussed the future of technology...',
      };

      const result = await classifyEvent(article);

      expect(result.eventType).toBe('GENERAL');
      expect(result.confidence).toBeLessThan(0.3);
    });

    it('should handle very short articles', async () => {
      const article = {
        ticker: 'AAPL',
        headline: 'Apple',
        summary: '',
      };

      const result = await classifyEvent(article);

      expect(result.eventType).toBe('GENERAL');
      expect(result.confidence).toBe(0);
    });
  });

  describe('Headline vs Summary Weighting', () => {
    it('should weight headline more than summary', async () => {
      const headlineArticle = {
        ticker: 'AAPL',
        headline: 'Apple Reports Earnings Beat',
        summary: 'The company also launched a new product...',
      };

      const summaryArticle = {
        ticker: 'AAPL',
        headline: 'Apple Launches New Product',
        summary: 'The launch follows strong earnings last quarter...',
      };

      const headlineResult = await classifyEvent(headlineArticle);
      const summaryResult = await classifyEvent(summaryArticle);

      // Headline mention should classify as EARNINGS
      expect(headlineResult.eventType).toBe('EARNINGS');

      // Summary mention should classify as PRODUCT_LAUNCH (headline takes priority)
      expect(summaryResult.eventType).toBe('PRODUCT_LAUNCH');
    });
  });
});
```

**Commit Message Template:**
```
feat(event-classifier): add event classification service

- Implement main classifyEvent service function
- Add article preprocessing with headline/summary weighting
- Implement multi-event conflict resolution via priority
- Handle ambiguous cases with GENERAL fallback
- Add comprehensive test coverage for all event types

Author & Committer: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com
```

**Estimated Tokens:** ~15,000

---

### Task 5: Integrate with Sentiment Processing Pipeline

**Goal:** Integrate the event classifier into the existing sentiment processing service so every article gets classified before sentiment analysis.

**Files to Modify:**
- `backend/src/services/sentimentProcessing.service.ts` - Add event classification step
- `backend/src/services/__tests__/sentimentProcessing.service.simple.test.ts` - Update tests

**Prerequisites:**
- Task 4 completed
- Understanding of existing sentiment processing flow
- Review of current `processSentimentForTicker` function

**Implementation Steps:**

1. **Add Event Classification to Pipeline**
   - Import `classifyEvent` service
   - Call classification before sentiment analysis
   - Store event type in processing result

2. **Update Processing Flow**
   - Current: Fetch articles → Analyze sentiment → Cache
   - New: Fetch articles → **Classify event** → Analyze sentiment → Cache
   - Ensure event type is passed through to caching step

3. **Update Result Interfaces**
   - Add `eventType` to `SentimentProcessingResult`
   - Ensure backward compatibility (make optional initially)

4. **Add Logging**
   - Log event classification results at info level
   - Log event type distribution (X earnings, Y M&A, etc.) at end of batch

5. **Handle Classification Errors**
   - If classification fails, default to GENERAL
   - Log error but continue processing
   - Don't let classification failures block sentiment analysis

**Verification Checklist:**
- [ ] `processSentimentForTicker` calls `classifyEvent` for each article
- [ ] Event type included in processing result
- [ ] Existing tests still pass (backward compatibility)
- [ ] New tests verify event classification integration
- [ ] Error handling prevents classification failures from blocking pipeline

**Testing Instructions:**
- Update existing tests to verify event type is present
- Add test for classification error handling
- Verify pipeline performance (classification adds <50ms per article)
- Integration test: Process batch of articles, verify all have event types

**Example Test:**
```typescript
import { processSentimentForTicker } from '../sentimentProcessing.service';
import * as EventClassifier from '../eventClassification.service';

describe('Sentiment Processing with Event Classification', () => {
  it('should classify events before analyzing sentiment', async () => {
    const classifySpy = jest.spyOn(EventClassifier, 'classifyEvent');

    const result = await processSentimentForTicker(
      'AAPL',
      '2025-01-01',
      '2025-01-30'
    );

    // Verify classification was called
    expect(classifySpy).toHaveBeenCalled();

    // Verify results include event types
    expect(result.dailySentiment[0]).toHaveProperty('eventType');
  });

  it('should handle classification errors gracefully', async () => {
    jest.spyOn(EventClassifier, 'classifyEvent')
      .mockRejectedValue(new Error('Classification failed'));

    // Should not throw, should default to GENERAL
    const result = await processSentimentForTicker(
      'AAPL',
      '2025-01-01',
      '2025-01-30'
    );

    expect(result.dailySentiment[0].eventType).toBe('GENERAL');
  });
});
```

**Commit Message Template:**
```
feat(event-classifier): integrate with sentiment pipeline

- Add event classification step before sentiment analysis
- Update processing result to include event types
- Add error handling for classification failures
- Ensure backward compatibility with existing tests
- Add logging for event type distribution

Author & Committer: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com
```

**Estimated Tokens:** ~10,000

---

### Task 6: Create Event Classification Handler (Optional API Endpoint)

**Goal:** Create standalone Lambda handler for event classification that can be called independently for testing and debugging.

**Files to Create:**
- `backend/src/handlers/events.handler.ts` - HTTP handler for event classification
- `backend/src/handlers/__tests__/events.handler.test.ts` - Handler tests

**Prerequisites:**
- Task 4 completed
- Understanding of existing Lambda handler pattern (see `sentiment.handler.ts`)
- Familiarity with API Gateway event structure

**Implementation Steps:**

1. **Define API Request/Response Interfaces**
   - Request: `{ articles: NewsArticle[] }`
   - Response: `{ classifications: EventClassificationResult[] }`
   - Support batch classification (up to 100 articles)

2. **Implement Handler Function**
   - Parse API Gateway event
   - Validate input (articles array, valid structure)
   - Call `classifyEvent` for each article
   - Return results with appropriate HTTP status codes

3. **Add Error Handling**
   - 400 Bad Request: Invalid input structure
   - 500 Internal Server Error: Classification failures
   - Include error details in response body

4. **Add CORS Headers**
   - Match existing handler pattern
   - Allow requests from frontend origins

5. **Implement Batch Optimization**
   - Process classifications in parallel (Promise.all)
   - Limit batch size to prevent timeouts
   - Add timeout handling (Lambda 30s limit)

**Verification Checklist:**
- [ ] Handler accepts POST requests with articles array
- [ ] Returns classifications with event types and confidence
- [ ] Handles invalid inputs with 400 status
- [ ] Includes CORS headers
- [ ] Batch processing works for 1-100 articles
- [ ] Timeout protection for large batches

**Testing Instructions:**
- Create mock API Gateway events
- Test single article classification
- Test batch classification (10, 50, 100 articles)
- Test invalid inputs (empty array, malformed articles)
- Test error scenarios (service failures)

**Example Tests:**
```typescript
import { eventsHandler } from '../events.handler';
import { createAPIGatewayEvent } from '../../__tests__/utils/apiGateway';

describe('Events Handler', () => {
  it('should classify single article', async () => {
    const event = createAPIGatewayEvent({
      method: 'POST',
      body: {
        articles: [{
          ticker: 'AAPL',
          headline: 'Apple Reports Earnings Beat',
          summary: 'Apple Inc. reported Q1 earnings...'
        }]
      }
    });

    const response = await eventsHandler(event);

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.classifications).toHaveLength(1);
    expect(body.classifications[0].eventType).toBe('EARNINGS');
  });

  it('should handle batch classification', async () => {
    const articles = Array(10).fill(null).map((_, i) => ({
      ticker: 'AAPL',
      headline: `Apple Article ${i}`,
      summary: 'Apple reports earnings beat...'
    }));

    const event = createAPIGatewayEvent({
      method: 'POST',
      body: { articles }
    });

    const response = await eventsHandler(event);
    const body = JSON.parse(response.body);

    expect(body.classifications).toHaveLength(10);
  });

  it('should return 400 for invalid input', async () => {
    const event = createAPIGatewayEvent({
      method: 'POST',
      body: { articles: 'not an array' }
    });

    const response = await eventsHandler(event);

    expect(response.statusCode).toBe(400);
  });
});
```

**Commit Message Template:**
```
feat(event-classifier): add standalone classification handler

- Create Lambda handler for event classification API
- Support batch classification up to 100 articles
- Add comprehensive error handling and validation
- Include CORS headers for frontend access
- Add tests for single and batch processing

Author & Committer: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com
```

**Estimated Tokens:** ~12,000

---

### Task 7: Add Classification Monitoring and Metrics

**Goal:** Implement monitoring to track classification accuracy, event distribution, and performance metrics for production visibility.

**Files to Modify:**
- `backend/src/services/eventClassification.service.ts` - Add metrics tracking
- `backend/src/utils/metrics.util.ts` - Add event classification metrics

**Prerequisites:**
- Task 4 completed
- Review of existing metrics utility
- Understanding of CloudWatch custom metrics (if applicable)

**Implementation Steps:**

1. **Track Classification Metrics**
   - Event type distribution (count per event type)
   - Confidence score distribution (histogram: 0-0.3, 0.3-0.7, 0.7-1.0)
   - Processing time per article
   - Multi-event conflict rate

2. **Add Performance Tracking**
   - Time classification operations
   - Track average time per article
   - Identify slow classifications (>100ms)

3. **Implement Logging Aggregation**
   - Log event type distribution every N articles (e.g., every 100)
   - Log low-confidence classifications for review
   - Log multi-event conflicts with resolution details

4. **Create Metrics Export Function**
   - Optional CloudWatch metric publishing
   - Console logging for development
   - Structured JSON format for log aggregation tools

**Verification Checklist:**
- [ ] Event type counts tracked during processing
- [ ] Confidence scores logged with articles
- [ ] Performance metrics captured (timing)
- [ ] Periodic metric summaries logged
- [ ] Metrics exportable to monitoring service (optional)

**Testing Instructions:**
- Process batch of articles
- Verify metrics are logged
- Check metric accuracy (counts match article totals)
- Verify performance tracking doesn't add significant overhead (<5ms)

**Example Implementation:**
```typescript
// In eventClassification.service.ts
import { trackMetric, logMetricsSummary } from '../utils/metrics.util';

let classificationMetrics = {
  EARNINGS: 0,
  M&A: 0,
  PRODUCT_LAUNCH: 0,
  ANALYST_RATING: 0,
  GUIDANCE: 0,
  GENERAL: 0,
  totalProcessed: 0,
  avgConfidence: 0,
  avgDuration: 0
};

export async function classifyEvent(article: NewsArticle): Promise<EventClassificationResult> {
  const startTime = performance.now();

  // ... existing classification logic ...

  const duration = performance.now() - startTime;

  // Track metrics
  classificationMetrics[result.eventType]++;
  classificationMetrics.totalProcessed++;
  classificationMetrics.avgDuration =
    (classificationMetrics.avgDuration * (classificationMetrics.totalProcessed - 1) + duration) /
    classificationMetrics.totalProcessed;

  // Log every 100 classifications
  if (classificationMetrics.totalProcessed % 100 === 0) {
    logMetricsSummary('Event Classification', classificationMetrics);
  }

  return result;
}
```

**Commit Message Template:**
```
feat(event-classifier): add monitoring and metrics

- Track event type distribution during processing
- Add confidence score and performance metrics
- Implement periodic metrics logging
- Add structured metrics export function
- Include tests for metrics accuracy

Author & Committer: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com
```

**Estimated Tokens:** ~8,000

---

### Task 8: Create Classification Documentation and Examples

**Goal:** Document the event classification system with usage examples, keyword lists, and classification decision tree for future maintainers.

**Files to Create:**
- `backend/docs/event-classification.md` - Classification system documentation
- `backend/src/ml/events/examples/` - Example articles for each event type (JSON fixtures)

**Prerequisites:**
- All previous tasks completed
- Classification system fully tested and validated

**Implementation Steps:**

1. **Write System Overview**
   - Explain the six event types and their definitions
   - Document the classification algorithm (keyword matching + priority)
   - Include accuracy expectations and limitations

2. **Document Keyword Sets**
   - List all primary and secondary keywords per event type
   - Explain context requirements
   - Note common false positives and how they're handled

3. **Create Decision Tree Diagram**
   - Visual flowchart of classification process
   - Show conflict resolution logic
   - Include fallback to GENERAL

4. **Provide Usage Examples**
   - Code examples for calling `classifyEvent`
   - Example inputs and expected outputs
   - Integration with sentiment pipeline

5. **Create Test Fixtures**
   - JSON files with realistic article examples for each event type
   - Include edge cases and ambiguous examples
   - Use in automated tests and manual validation

6. **Add Maintenance Guide**
   - How to add new keywords
   - How to adjust priority weights
   - How to evaluate classification accuracy
   - When to retrain/update the system

**Verification Checklist:**
- [ ] Documentation covers all event types
- [ ] Keyword lists are comprehensive and up-to-date
- [ ] Decision tree accurately reflects implementation
- [ ] Code examples are runnable and correct
- [ ] Test fixtures include all 6 event types
- [ ] Maintenance guide is actionable

**Testing Instructions:**
- No automated tests (documentation only)
- Manual review of documentation accuracy
- Verify code examples compile and run
- Validate test fixtures against classification service

**Example Documentation Structure:**
```markdown
# Event Classification System

## Overview
The event classification system categorizes financial news articles into six types...

## Event Types

### EARNINGS
**Definition:** Articles about quarterly/annual earnings reports, EPS, revenue results.

**Primary Keywords:** earnings, EPS, quarterly results, beats estimates...

**Example Articles:**
- "Apple Reports Q1 Earnings Beat" → EARNINGS (confidence: 0.92)
- "Tesla Misses EPS Expectations" → EARNINGS (confidence: 0.88)

### M&A
**Definition:** Articles about mergers, acquisitions, takeovers, spin-offs.
...

## Classification Algorithm

1. Normalize article text (headline + summary)
2. Score against all 6 event types
3. If multiple high scores, use priority:
   - EARNINGS (highest)
   - M&A
   - GUIDANCE
   - ANALYST_RATING
   - PRODUCT_LAUNCH
   - GENERAL (lowest)
4. Return event type with confidence score

## Usage

```typescript
import { classifyEvent } from './services/eventClassification.service';

const article = {
  ticker: 'AAPL',
  headline: 'Apple Reports Strong Earnings',
  summary: 'Apple Inc. beat analyst estimates...'
};

const result = await classifyEvent(article);
// { eventType: 'EARNINGS', confidence: 0.92, matchedKeywords: ['earnings', 'estimates'] }
```

## Maintenance

### Adding New Keywords
1. Edit `backend/src/ml/events/keywords.ts`
2. Add keyword to appropriate event type
3. Run tests: `npm test -- keywords.test.ts`
4. Validate with test fixtures
...
```

**Commit Message Template:**
```
docs(event-classifier): add comprehensive documentation

- Document event classification system and algorithm
- List all keywords and context requirements
- Add decision tree diagram for conflict resolution
- Include usage examples and code snippets
- Create test fixtures for all event types
- Add maintenance guide for future updates

Author & Committer: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com
```

**Estimated Tokens:** ~7,000

---

## Phase Verification

### Complete Phase Checklist

Before proceeding to Phase 2, verify:

- [ ] All 8 tasks completed and committed
- [ ] All tests passing (`npm test`)
- [ ] TypeScript compiles without errors (`npm run type-check`)
- [ ] Event classifier achieves 85%+ accuracy on test fixtures
- [ ] Classification adds <50ms average latency
- [ ] Integration with sentiment pipeline works end-to-end
- [ ] Documentation complete and accurate
- [ ] No console.log statements in production code
- [ ] Metrics logging functional

### Integration Test

Run this end-to-end test to verify Phase 1:

```typescript
import { processSentimentForTicker } from '../services/sentimentProcessing.service';

describe('Phase 1 Integration Test', () => {
  it('should classify events for all articles in batch', async () => {
    const result = await processSentimentForTicker(
      'AAPL',
      '2025-01-01',
      '2025-01-30'
    );

    // Verify all articles have event types
    result.dailySentiment.forEach(item => {
      expect(item.eventType).toBeDefined();
      expect(['EARNINGS', 'M&A', 'PRODUCT_LAUNCH', 'ANALYST_RATING', 'GUIDANCE', 'GENERAL'])
        .toContain(item.eventType);
    });

    // Verify at least some variety in event types (not all GENERAL)
    const eventTypes = new Set(result.dailySentiment.map(item => item.eventType));
    expect(eventTypes.size).toBeGreaterThan(1);
  });
});
```

### Known Limitations

At the end of Phase 1:
- Classification is rule-based (no ML), limited by keyword quality
- Cannot handle complex multi-event articles beyond simple priority
- Headline weighting is fixed (3x), not adaptive
- No automatic keyword learning or adaptation
- Context windows fixed at 10 words

These limitations are acceptable for this phase. Phase 2 (Aspect Analysis) and Phase 3 (DistilFinBERT) will add sophistication.

---

## Review Feedback (Iteration 1)

### Critical: Backend Tests Not Running

> **Question:** When you run `npm test` in the backend directory, what error do you see about the Jest preset?
>
> **Consider:** The error message says "Preset ts-jest/presets/default-esm not found." Have you checked if the preset actually exists in `node_modules/ts-jest/presets/`?
>
> **Think about:** Looking at `backend/jest.config.js:2`, the preset is specified as a string `'ts-jest/presets/default-esm'`. For ESM modules with Node's `--experimental-vm-modules` flag, does Jest resolve module paths differently?
>
> **Reflect:** Check the ts-jest documentation for ESM configuration. Should the preset path be specified differently when using `"type": "module"` in package.json?
>
> **Why this matters:** Without running tests, you cannot verify that any of the Phase 1 implementation works correctly. This is a blocker for approval.

### Task 2: Keyword Library - Duplicate Keyword

> **Consider:** In `backend/src/ml/events/keywords.ts`, look at the GUIDANCE event type. What keyword appears in both the `primary` array (line 224) and the `context` array (line 254)?
>
> **Think about:** The test `keywords.test.ts:134` checks that all keywords within a single event type are unique. Why would having "expects" in both arrays cause a problem?
>
> **Reflect:** Should "expects" be a primary keyword (strong signal) or a context keyword (validation word)? Which role makes more semantic sense for classification?

### Test Failures: Frontend Integration Tests

> **Question:** Looking at the test failures for `stocks.handler.cache.test.ts` and `news.handler.cache.test.ts`, the tests expect status code 200 but receive 500. What do 500 status codes typically indicate?
>
> **Consider:** The integration tests are returning Internal Server Error (500) instead of success (200). Have you checked the actual error messages in the test output or handler logs?
>
> **Think about:** These tests are in `backend/__tests__/handlers/` but may be failing because they can't import modules. Look at the other test failures - do you see patterns like "Cannot find module '../../src/utils/cache.util.js'"?
>
> **Reflect:** Are the handler tests trying to import TypeScript modules with `.js` extensions? How does this relate to the ESM/Jest configuration issue?

### Test Failures: Missing Modules

> **Consider:** Several tests fail with "Cannot find module" errors for:
> - `cache.util.js`
> - `newsCache.repository.js`
> - `stocksCache.repository.js`
> - `job.util.js`
> - `dynamodb.util.js`
>
> **Question:** Do these TypeScript source files exist in `backend/src/`? If so, why can't Jest find them when tests import with `.js` extensions?
>
> **Think about:** In ESM TypeScript projects, you import with `.js` extensions even though the source files are `.ts`. Does Jest understand this mapping with your current configuration?
>
> **Reflect:** Look at `backend/jest.config.js:19-21` - there's a `moduleNameMapper`. Is it correctly configured to resolve `.js` imports to `.ts` source files?

### Verification Reminder

> **Before requesting re-review:** Ensure you can successfully run:
> ```bash
> cd backend
> npm test  # All backend tests should run and pass
> npm run type-check  # Should pass (this already works ✓)
> ```
>
> **Minimum criteria for approval:**
> - Backend tests run without Jest configuration errors
> - Keyword duplicate resolved
> - Event classification tests pass (keywords, matcher, service)
> - Integration tests pass (or are properly skipped if unrelated to Phase 1)

## Next Steps

After Phase 1 verification passes, proceed to:
- [Phase 2: Aspect-Based Analysis System](./Phase-2.md)
