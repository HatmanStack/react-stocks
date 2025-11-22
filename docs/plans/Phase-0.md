# Phase 0: Architecture & Design Foundation

This phase documents all architectural decisions, design patterns, and shared conventions that apply across all implementation phases. Read this thoroughly before beginning any implementation.

## Table of Contents
- [Architecture Decisions](#architecture-decisions)
- [Tech Stack](#tech-stack)
- [Design Patterns](#design-patterns)
- [Data Flow](#data-flow)
- [Testing Strategy](#testing-strategy)
- [Common Pitfalls](#common-pitfalls)

---

## Architecture Decisions

### ADR-001: Three-Signal Sentiment Architecture

**Context:** Current bag-of-words sentiment provides a single signal (positive/negative counts) which lacks nuance for trading decisions.

**Decision:** Implement three independent signals that feed into the prediction model:

1. **Event Classification** (Categorical)
   - Values: `EARNINGS`, `M&A`, `PRODUCT_LAUNCH`, `ANALYST_RATING`, `GUIDANCE`, `GENERAL`
   - Purpose: Different event types have different market impact patterns
   - Implementation: Rule-based keyword matching + context validation

2. **Aspect Score** (Numerical: -1 to +1)
   - Analyzes key financial aspects: revenue, EPS, earnings, guidance, margins, growth
   - Aggregates aspect-level signals into single directional score
   - Purpose: Captures "mixed" signals (e.g., revenue beat but margin miss)
   - Implementation: Financial keyword extraction + weighted scoring

3. **DistilFinBERT Sentiment** (Numerical: -1 to +1)
   - Contextual sentiment using transformer model
   - Only runs on material events (EARNINGS, M&A, GUIDANCE, ANALYST_RATING)
   - Purpose: Sophisticated understanding of nuance and context
   - Implementation: External Python service, cached results

**Consequences:**
- Prediction model gains 2 new features (event type, aspect score)
- DistilFinBERT sentiment replaces simple positive/negative counts
- Increased complexity, but significantly better signal quality
- Hybrid approach balances accuracy and performance

**Status:** Accepted

---

### ADR-002: Hybrid Processing Strategy

**Context:** Running DistilFinBERT on all articles would be slow and expensive. Bag-of-words is fast but inaccurate.

**Decision:** Use tiered processing based on event classification:

```
Article → Event Classifier
           ↓
    Material Event? (Earnings, M&A, etc.)
           ↓
    YES: DistilFinBERT + Aspect Analysis
    NO:  Bag-of-words only
```

**Material Events:**
- EARNINGS
- M&A (Merger, Acquisition, Spin-off)
- GUIDANCE (Forward guidance, outlook changes)
- ANALYST_RATING (Upgrades, downgrades, target changes)

**Non-Material Events:**
- PRODUCT_LAUNCH
- GENERAL (all other news)

**Consequences:**
- ~20-30% of articles get DistilFinBERT (material events)
- ~70-80% get fast bag-of-words (general news)
- Balances accuracy where it matters with performance
- Event classifier becomes critical path - must be accurate

**Status:** Accepted

---

### ADR-003: Aspect-Based Analysis Methodology

**Context:** Need to extract actionable signals from financial aspects without full NLP pipeline.

**Decision:** Use keyword-based aspect extraction with weighted scoring:

**Aspects to Track:**
- `revenue` / `sales` / `top line`
- `earnings` / `EPS` / `profit`
- `guidance` / `outlook` / `forecast`
- `margins` / `profitability`
- `growth` / `expansion`
- `debt` / `cash` / `liquidity`

**Scoring Algorithm:**
```
For each aspect:
  1. Extract sentences mentioning aspect keywords
  2. Detect sentiment polarity (beat/miss, up/down, strong/weak)
  3. Assign aspect weight based on materiality
  4. Aggregate: aspectScore = Σ(polarity × weight)

Final aspect score = normalize(-1 to +1)
```

**Example:**
```
"Revenue grew 15% beating estimates" → revenue: +0.8
"EPS missed by 10%" → earnings: -0.6
"Raised guidance" → guidance: +0.7

Aspect Score = (0.8×0.4 + -0.6×0.4 + 0.7×0.2) / 1.0 = +0.22
```

**Consequences:**
- Fast, deterministic scoring
- Explainable results (can show which aspects drove score)
- Limited by keyword quality - requires domain expertise
- Won't catch complex relationships (handled by DistilFinBERT)

**Status:** Accepted

---

### ADR-004: DynamoDB Schema Extension

**Context:** Current `SentimentCacheItem` only stores positive/negative counts and overall sentiment.

**Decision:** Extend schema to include new signals while maintaining backward compatibility:

**New Schema:**
```typescript
interface SentimentCacheItem {
  // Existing fields (keep for backward compat)
  ticker: string;              // PK
  articleHash: string;         // SK
  sentiment: {
    positive: number;          // DEPRECATED but kept
    negative: number;          // DEPRECATED but kept
    sentimentScore: number;    // Overall score
    classification: 'POS' | 'NEG' | 'NEUT';
  };
  analyzedAt: number;
  ttl: number;

  // NEW FIELDS
  eventType: EventType;        // Event classification
  aspectScore: number;         // Aspect analysis (-1 to +1)
  aspectBreakdown?: {          // Optional detailed breakdown
    revenue?: number;
    earnings?: number;
    guidance?: number;
    // ... other aspects
  };
  distilFinBERTScore?: number; // Only present for material events
  modelVersion: string;        // Track which analysis version
}
```

**Migration Strategy:**
- Add new fields as optional (nullable)
- Old records remain valid
- Update processing service to populate new fields
- Frontend gracefully handles missing fields
- TTL expires old records naturally (7 days)

**Status:** Accepted

---

### ADR-005: DistilFinBERT Deployment Architecture

**Context:** DistilFinBERT is a Python-based model that needs to integrate with Node.js Lambda backend.

**Decision:** Deploy as separate microservice with HTTP API:

**Architecture:**
```
Lambda (Node.js)
    ↓ HTTP Request
DistilFinBERT Service (Python + FastAPI)
    ↓ Model Inference
Return: { sentiment: number (-1 to +1), confidence: number }
```

**Deployment Options:**
1. **Phase 3 Default:** AWS Lambda (Python runtime) with API Gateway
2. **Alternative:** ECS Fargate container (for larger models/batching)

**Caching Strategy:**
- Results cached in DynamoDB with article hash
- Cache hit rate expected ~80%+ (same articles analyzed repeatedly)
- TTL: 30 days (sentiment doesn't change)

**Consequences:**
- Additional infrastructure cost (~$5-20/month depending on volume)
- Network latency (50-200ms) acceptable for async processing
- Python dependency isolated from main app
- Can swap models without touching main codebase

**Status:** Accepted

---

### ADR-006: DistilFinBERT Deployment on AWS Lambda

**Context:** DistilFinBERT is a Python-based model that needs HTTP API access from Node.js Lambda backend.

**Decision:** Deploy DistilFinBERT as AWS Lambda function with Python 3.9 runtime and API Gateway.

**Why Lambda over ECS Fargate:**
- **Cost:** Lambda pay-per-request (~$0.20/1M requests) vs ECS always-on (~$20-30/month minimum)
- **Simplicity:** No container orchestration, automatic scaling
- **Cold starts acceptable:** Async sentiment processing tolerates 5-10s cold starts
- **Model size:** DistilBERT fits in Lambda (distilled from BERT, ~250MB)
- **Volume:** Expected <10k requests/day initially (Lambda sweet spot)

**Deployment Architecture:**
```
Lambda Backend (Node.js)
    ↓ HTTPS
API Gateway
    ↓
Lambda Function (Python 3.9)
    ├─ DistilFinBERT model (Lambda Layer)
    └─ FastAPI handler
```

**Configuration:**
- Memory: 2048MB (model needs RAM)
- Timeout: 30s
- Ephemeral storage: 1024MB (model files)
- Runtime: Python 3.9
- API Gateway: HTTP API (not REST - simpler, cheaper)

**Migration Path if Needed:**
If volume exceeds 100k requests/day or cold starts become issue:
- Move to ECS Fargate (always-warm container)
- Or use Lambda provisioned concurrency (keeps warm)
- Architecture stays same (HTTP API unchanged)

**Consequences:**
- Phase 3 Task 2 will implement Lambda deployment only
- SAM template used for IaC (consistent with existing backend)
- Cold start monitoring required to detect if ECS migration needed

**Status:** Accepted

---

## Tech Stack

### Backend (Lambda)
- **Runtime:** Node.js 20.x
- **Language:** TypeScript 5.6+
- **Testing:** Jest with ts-jest
- **ML Library:** None (calls external service)
- **Storage:** DynamoDB (existing)

### DistilFinBERT Service
- **Runtime:** Python 3.9
- **Framework:** FastAPI + Mangum (Lambda adapter)
- **ML Library:** Hugging Face Transformers (`transformers` package)
- **Model:** `distilbert-base-uncased-finetuned-sst-2-english` or `ProsusAI/finbert`
- **Deployment:** AWS Lambda (Python) - see ADR-006

### Frontend (React Native)
- **No Changes Required:** New signals consumed by existing prediction hooks
- **Display:** Phase 5 updates article detail view to show event/aspect/sentiment

---

## Design Patterns

### 1. Repository Pattern
All DynamoDB access goes through repository layer:

```typescript
// backend/src/repositories/sentimentCache.repository.ts
export async function putSentiment(item: SentimentCacheItem): Promise<void>
export async function getSentiment(ticker: string, hash: string): Promise<SentimentCacheItem | null>
```

**Do:**
- Keep business logic out of repositories
- Repositories handle only CRUD + caching
- Use TypeScript interfaces for data shapes

**Don't:**
- Put analysis logic in repositories
- Access DynamoDB directly from services

### 2. Service Layer Pattern
Business logic lives in services:

```typescript
// backend/src/services/eventClassification.service.ts
export async function classifyEvent(article: NewsArticle): Promise<EventType>

// backend/src/services/aspectAnalysis.service.ts
export async function analyzeAspects(article: NewsArticle): Promise<AspectScore>

// backend/src/services/distilFinBERT.service.ts
export async function getSentiment(text: string): Promise<FinBERTResult>
```

**Do:**
- One service per major function
- Services orchestrate repositories and utilities
- Export clear, typed interfaces

**Don't:**
- Mix concerns (keep event classification separate from sentiment)
- Couple services tightly (use dependency injection patterns)

### 3. Type-First Development
Define types before implementation:

```typescript
// backend/src/types/sentiment.types.ts
export type EventType =
  | 'EARNINGS'
  | 'M&A'
  | 'PRODUCT_LAUNCH'
  | 'ANALYST_RATING'
  | 'GUIDANCE'
  | 'GENERAL';

export interface AspectBreakdown {
  revenue?: number;
  earnings?: number;
  guidance?: number;
  margins?: number;
  growth?: number;
  debt?: number;
}

export interface AspectAnalysisResult {
  overallScore: number;
  breakdown: AspectBreakdown;
  confidence: number;
}
```

**Do:**
- Define types in dedicated `types/` files
- Use discriminated unions for event types
- Make optional fields explicit with `?`

**Don't:**
- Use `any` or `unknown` unless absolutely necessary
- Define types inline in functions

### 4. Error Handling Pattern

```typescript
import { APIError } from '../utils/error.util';

try {
  const result = await externalService();
  return result;
} catch (error) {
  if (error instanceof APIError) {
    // Rethrow API errors (already formatted)
    throw error;
  }

  // Wrap unexpected errors
  console.error('[ServiceName] Unexpected error:', error);
  throw new APIError(
    `Failed to process: ${error instanceof Error ? error.message : String(error)}`,
    500
  );
}
```

**Do:**
- Log errors with service name prefix
- Use `APIError` for all thrown errors
- Include context in error messages

**Don't:**
- Swallow errors silently
- Throw raw Error objects from services
- Log sensitive data (API keys, user data)

---

## Data Flow

### Complete Article Processing Pipeline

```
1. Article Fetched (Finnhub)
   ↓
2. Event Classification
   → EventType: EARNINGS | M&A | GUIDANCE | ANALYST_RATING | PRODUCT_LAUNCH | GENERAL
   ↓
3. Is Material Event?
   ├─ YES → Material Event Path
   │   ├─ Aspect Analysis → AspectScore (-1 to +1)
   │   ├─ DistilFinBERT → FinBERTScore (-1 to +1)
   │   └─ Combine → SentimentCacheItem with all 3 signals
   │
   └─ NO → Non-Material Event Path
       ├─ Bag-of-words → Simple sentiment
       └─ Store → SentimentCacheItem (aspectScore=0, no FinBERT)
   ↓
4. Store in DynamoDB
   ↓
5. Aggregate Daily (existing logic)
   ↓
6. Feed to Prediction Model
   → Features: [eventType, aspectScore, finBERTScore, priceRatios, volume, ...]
   ↓
7. Generate Predictions (next day, 2 week, 1 month)
```

### Data Dependencies

```
Phase 1: Event Classifier
    ↓ (provides EventType)
Phase 2: Aspect Analyzer (uses EventType to determine relevance)
    ↓ (provides AspectScore)
Phase 3: DistilFinBERT (uses EventType to determine if needed)
    ↓ (provides FinBERTScore)
Phase 4: Storage (combines all signals)
    ↓ (provides complete SentimentCacheItem)
Phase 5: API & Prediction Model (consumes all signals)
```

---

## Testing Strategy

### Test Pyramid

```
     /\
    /  \  E2E (10%)
   /____\
  /      \  Integration (30%)
 /________\
/          \ Unit (60%)
```

### Unit Testing (60% of tests)
- Test each service function independently
- Mock external dependencies (DynamoDB, DistilFinBERT API)
- Focus on edge cases and error handling

**Example:**
```typescript
// backend/src/services/__tests__/eventClassification.service.test.ts
describe('classifyEvent', () => {
  it('should classify earnings articles correctly', () => {
    const article = {
      headline: 'Apple Reports Q1 Earnings Beat',
      summary: 'Apple Inc. reported earnings of $1.25 vs $1.15 expected...'
    };

    const result = classifyEvent(article);

    expect(result).toBe('EARNINGS');
  });

  it('should handle ambiguous articles', () => {
    const article = {
      headline: 'Apple Launches New Product',
      summary: 'The launch follows strong earnings last quarter...'
    };

    const result = classifyEvent(article);

    // Should prioritize primary topic (product launch over incidental earnings mention)
    expect(result).toBe('PRODUCT_LAUNCH');
  });
});
```

### Integration Testing (30% of tests)
- Test service interactions
- Use real DynamoDB (local instance or test table)
- Mock only external HTTP services (DistilFinBERT)

**Example:**
```typescript
// backend/src/__tests__/integration/sentimentPipeline.test.ts
describe('Sentiment Pipeline Integration', () => {
  it('should process material event end-to-end', async () => {
    const article = mockEarningsArticle();

    // Event classification
    const eventType = await classifyEvent(article);
    expect(eventType).toBe('EARNINGS');

    // Aspect analysis
    const aspectScore = await analyzeAspects(article);
    expect(aspectScore.overallScore).toBeCloseTo(0.5, 1);

    // DistilFinBERT (mocked)
    const finBERTScore = await getDistilFinBERTSentiment(article.text);
    expect(finBERTScore).toBeGreaterThan(0);

    // Storage
    const cacheItem = buildSentimentCacheItem({
      eventType,
      aspectScore: aspectScore.overallScore,
      distilFinBERTScore: finBERTScore,
      // ... other fields
    });

    await putSentiment(cacheItem);

    // Verify storage
    const retrieved = await getSentiment(article.ticker, article.hash);
    expect(retrieved.eventType).toBe('EARNINGS');
  });
});
```

### E2E Testing (10% of tests)
- Test full Lambda handler flow
- Use real API Gateway event format
- Verify HTTP responses and caching

**Example:**
```typescript
// backend/src/__tests__/e2e/sentiment.handler.test.ts
describe('Sentiment Handler E2E', () => {
  it('should return enhanced sentiment for material event', async () => {
    const event = createAPIGatewayEvent({
      path: '/sentiment',
      method: 'POST',
      body: {
        ticker: 'AAPL',
        articles: [mockEarningsArticle()]
      }
    });

    const response = await sentimentHandler(event);

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.sentiments[0]).toMatchObject({
      eventType: 'EARNINGS',
      aspectScore: expect.any(Number),
      distilFinBERTScore: expect.any(Number),
      sentimentScore: expect.any(Number)
    });
  });
});
```

### Test Data Management

**Fixtures:**
```typescript
// backend/src/__tests__/fixtures/articles.fixture.ts
export const mockEarningsArticle = (): NewsArticle => ({
  ticker: 'AAPL',
  headline: 'Apple Reports Strong Q1 Earnings',
  summary: 'Apple Inc. reported Q1 earnings of $1.25 per share, beating analyst estimates of $1.15. Revenue grew 15% year-over-year to $95B.',
  date: '2025-01-15',
  url: 'https://example.com/article',
  hash: 'abc123',
  source: 'Reuters'
});

export const mockMergersArticle = (): NewsArticle => ({
  // ... M&A article fixture
});
```

**Do:**
- Create realistic test data
- Use fixtures for common scenarios
- Include edge cases (empty strings, extreme values)

**Don't:**
- Use production data in tests
- Hard-code test data inline
- Share mutable test data across tests

---

## Common Pitfalls

### 1. Event Classification Ambiguity

**Problem:** Articles mention multiple events.

**Example:**
```
"Apple launches new iPhone after reporting strong earnings, analyst upgrades stock"
- Contains: PRODUCT_LAUNCH, EARNINGS, ANALYST_RATING
```

**Solution:** Priority order:
1. EARNINGS (highest priority - most material)
2. M&A
3. GUIDANCE
4. ANALYST_RATING
5. PRODUCT_LAUNCH
6. GENERAL (lowest)

**Implementation:**
```typescript
// Score each event type, return highest
const scores = {
  earnings: scoreEarningsKeywords(article),
  m&a: scoreMergersKeywords(article),
  // ...
};

return getHighestScoringEvent(scores);
```

### 2. Aspect Extraction False Positives

**Problem:** Aspect keywords appear in non-financial context.

**Example:**
```
"The company's guidance counselor program improved employee margins..."
- "guidance" and "margins" are not financial here
```

**Solution:** Require financial context words nearby:

```typescript
const isFinancialContext = (sentence: string, aspectKeyword: string) => {
  const contextWords = ['revenue', 'profit', 'earnings', 'forecast', 'expects', 'reported'];
  const nearbyText = getSurroundingWords(sentence, aspectKeyword, windowSize=10);

  return contextWords.some(word => nearbyText.includes(word));
};
```

### 3. DistilFinBERT Service Timeouts

**Problem:** External service calls can fail or timeout.

**Solution:** Implement retry logic with exponential backoff:

```typescript
async function getDistilFinBERTSentiment(text: string): Promise<number> {
  const MAX_RETRIES = 3;
  const TIMEOUT_MS = 5000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await fetchWithTimeout(distilFinBERTUrl, text, TIMEOUT_MS);
      return result.sentiment;
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        console.error('[DistilFinBERT] Max retries exceeded');
        // Fallback to bag-of-words
        return getBagOfWordsSentiment(text);
      }

      await sleep(Math.pow(2, attempt) * 1000); // Exponential backoff
    }
  }
}
```

### 4. DynamoDB Schema Migration

**Problem:** Old cache items don't have new fields.

**Solution:** Handle missing fields gracefully:

```typescript
function getSentimentSignals(cacheItem: SentimentCacheItem) {
  return {
    eventType: cacheItem.eventType ?? 'GENERAL', // Default for old items
    aspectScore: cacheItem.aspectScore ?? 0,     // Neutral default
    finBERTScore: cacheItem.distilFinBERTScore ?? cacheItem.sentiment.sentimentScore, // Fallback
  };
}
```

### 5. Prediction Model Feature Mismatch

**Problem:** Model expects exact number of features in specific order.

**Solution:** Use feature builder with validation:

```typescript
interface PredictionFeatures {
  // Price features (existing)
  priceRatio1d: number;
  priceRatio5d: number;
  volume: number;

  // NEW sentiment features
  eventType: number;      // One-hot encoded: [0,0,1,0,0,0] for GUIDANCE
  aspectScore: number;    // -1 to +1
  finBERTScore: number;   // -1 to +1
}

function buildFeatureVector(features: PredictionFeatures): number[] {
  // Ensure exact order and count
  return [
    features.priceRatio1d,
    features.priceRatio5d,
    features.volume,
    ...oneHotEncodeEvent(features.eventType), // 6 features (one per event type)
    features.aspectScore,
    features.finBERTScore
  ];

  // Validate length
  const expected = 11; // 3 price + 6 event + 1 aspect + 1 finBERT
  if (result.length !== expected) {
    throw new Error(`Feature vector length mismatch: expected ${expected}, got ${result.length}`);
  }
}
```

### 6. Performance Degradation

**Problem:** Running DistilFinBERT on all articles causes slow processing.

**Solution:** Enforce tiered processing:

```typescript
async function processSentiment(article: NewsArticle): Promise<SentimentCacheItem> {
  const eventType = await classifyEvent(article);

  const isMaterialEvent = ['EARNINGS', 'M&A', 'GUIDANCE', 'ANALYST_RATING'].includes(eventType);

  if (isMaterialEvent) {
    // Full analysis
    const [aspectScore, finBERTScore] = await Promise.all([
      analyzeAspects(article),
      getDistilFinBERTSentiment(article.text)
    ]);

    return buildSentimentCacheItem({ eventType, aspectScore, finBERTScore });
  } else {
    // Fast path
    const bagOfWords = analyzeBagOfWords(article.text);

    return buildSentimentCacheItem({
      eventType,
      aspectScore: 0,  // Not analyzed
      finBERTScore: null,  // Not analyzed
      sentiment: bagOfWords
    });
  }
}
```

---

## Development Guidelines

### Commit Message Format

Use conventional commits:

```
type(scope): brief description

- Detail 1
- Detail 2

Author & Committer: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code restructuring
- `test`: Adding/updating tests
- `docs`: Documentation only
- `chore`: Build process, dependencies

**Scopes:**
- `event-classifier`: Event classification system
- `aspect-analyzer`: Aspect analysis system
- `distilfinbert`: DistilFinBERT integration
- `schema`: Database schema changes
- `api`: API handler changes

**Example:**
```
feat(event-classifier): add earnings event detection

- Implement keyword-based classification
- Add tests for earnings article detection
- Handle edge cases (earnings mention in non-financial context)

Author & Committer: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com
```

### Code Review Checklist

Before moving to next task:
- [ ] All tests pass (`npm test`)
- [ ] TypeScript compiles without errors (`npm run type-check`)
- [ ] Code follows existing patterns (repository, service layers)
- [ ] Error handling implemented
- [ ] Logging added for debugging
- [ ] No console.log in production code (use console.error for errors)
- [ ] Types defined and exported
- [ ] Documentation comments added for public functions

---

## Next Steps

After reading this foundation document, proceed to:
- [Phase 1: Event Classification System](./Phase-1.md)
