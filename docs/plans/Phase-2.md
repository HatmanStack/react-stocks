# Phase 2: Aspect-Based Analysis System

## Phase Goal

Build an aspect-based sentiment scoring system that identifies key financial aspects (revenue, earnings, guidance, margins, growth, debt) within articles and assigns weighted sentiment scores to each. The system produces a single numerical aspect score (-1 to +1) that captures nuanced signals like "revenue strong but margins weak" - critical for accurate trading signals.

**Success Criteria:**
- Correctly identifies 6 key financial aspects in articles
- Assigns accurate polarity (+/-) to detected aspects (90%+ accuracy)
- Weighted scoring properly prioritizes material aspects (earnings, revenue)
- Aspect scores correlate with actual stock price movements
- Processing adds <30ms per article
- Full test coverage with real article examples

**Estimated Tokens:** ~85,000

---

## Prerequisites

- Phase 0 reviewed (especially ADR-003: Aspect-Based Analysis Methodology)
- Phase 1 completed (event classification working)
- Understanding of financial statement terminology
- Familiarity with text proximity matching

---

## Tasks

### Task 1: Define Aspect System and Weights

**Goal:** Create type-safe aspect definitions with materiality weights that determine how much each aspect influences the overall score.

**Files to Create:**
- `backend/src/types/aspect.types.ts` - Aspect type definitions and weight configuration

**Prerequisites:**
- Review of Phase-0 ADR-003
- Understanding of financial materiality (what matters most to stock prices)

**Implementation Steps:**

1. **Define Aspect Type Enum**
   - Create union type for the 6 financial aspects
   - Use consistent naming (REVENUE, EARNINGS, GUIDANCE, MARGINS, GROWTH, DEBT)

2. **Define Aspect Weight Configuration**
   - Assign weights based on market materiality:
     - `REVENUE`: 25% - Top line growth drives valuations
     - `EARNINGS`: 30% - Bottom line most critical for profitability
     - `GUIDANCE`: 20% - Forward-looking signals
     - `MARGINS`: 15% - Profitability quality
     - `GROWTH`: 5% - Long-term trajectory
     - `DEBT`: 5% - Financial health indicator
   - Weights must sum to 100% (1.0)

3. **Define Aspect Detection Result Interface**
   - Structure: aspect type, polarity score (-1 to +1), confidence (0-1), matched text
   - Include source sentence for debugging/explainability

4. **Define Aspect Analysis Result Interface**
   - Overall score (-1 to +1)
   - Breakdown of individual aspect scores
   - Total confidence based on number of aspects detected
   - Detected aspects array for UI display

**Verification Checklist:**
- [ ] `AspectType` enum defined with 6 aspects
- [ ] `ASPECT_WEIGHTS` constant defined, sums to 1.0
- [ ] `AspectDetectionResult` interface includes aspect, score, confidence, text
- [ ] `AspectAnalysisResult` interface includes overallScore and breakdown
- [ ] All types exported and documented with JSDoc

**Testing Instructions:**
- Type-only module, verify compilation
- Create test to verify weights sum to 1.0:
  ```typescript
  const totalWeight = Object.values(ASPECT_WEIGHTS).reduce((a, b) => a + b, 0);
  expect(totalWeight).toBeCloseTo(1.0, 2);
  ```

**Commit Message Template:**
```
feat(aspect-analyzer): define aspect system and weights

- Add AspectType enum with 6 financial aspects
- Define materiality-based aspect weights (sum to 100%)
- Create AspectDetectionResult and AspectAnalysisResult interfaces
- Add comprehensive JSDoc documentation

Author & Committer: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com
```

**Estimated Tokens:** ~4,000

---

### Task 2: Create Aspect Keyword Library

**Goal:** Build comprehensive keyword sets for each aspect with separate positive and negative signal words.

**Files to Create:**
- `backend/src/ml/aspects/keywords.ts` - Aspect keywords and polarity signals

**Prerequisites:**
- Task 1 completed
- Understanding of financial terminology
- Review of Phase-0 Common Pitfall #2 (False Positives)

**Implementation Steps:**

1. **Structure Aspect Keywords**
   - For each aspect: base keywords, positive signals, negative signals, context words
   - Example structure:
     ```typescript
     REVENUE: {
       base: ['revenue', 'sales', 'top line'],
       positive: ['beat', 'exceeded', 'grew', 'strong', 'up'],
       negative: ['missed', 'fell', 'weak', 'declined', 'down'],
       context: ['reported', 'announced', 'expects']
     }
     ```

2. **Define Revenue Keywords**
   - Base: "revenue", "sales", "top line", "top-line", "topline"
   - Positive: "beat", "exceeded", "grew", "growth", "strong", "rose", "up", "increase"
   - Negative: "missed", "fell", "weak", "declined", "down", "decrease", "shortfall"
   - Context: "reported", "announced", "posted", "%", "billion", "million"

3. **Define Earnings Keywords**
   - Base: "earnings", "EPS", "profit", "net income", "bottom line"
   - Positive: "beat", "exceeded", "surge", "strong", "record", "up"
   - Negative: "missed", "fell", "loss", "weak", "down", "disappointing"
   - Context: "per share", "reported", "vs", "estimates", "expected"

4. **Define Guidance Keywords**
   - Base: "guidance", "outlook", "forecast", "projects", "expects"
   - Positive: "raised", "increased", "upgraded", "optimistic", "strong"
   - Negative: "lowered", "reduced", "downgraded", "cautious", "weak"
   - Context: "for", "next quarter", "full year", "FY", "Q1", "Q2", "Q3", "Q4"

5. **Define Margins Keywords**
   - Base: "margin", "margins", "profitability", "operating margin", "gross margin"
   - Positive: "expanded", "improved", "grew", "strong", "up"
   - Negative: "compressed", "contracted", "fell", "weak", "down"
   - Context: "percentage", "%", "basis points", "bps"

6. **Define Growth Keywords**
   - Base: "growth", "expansion", "growing", "expands"
   - Positive: "accelerating", "strong", "robust", "rapid", "double-digit"
   - Negative: "slowing", "decelerating", "weak", "stagnant", "flat"
   - Context: "year-over-year", "YoY", "QoQ", "%"

7. **Define Debt Keywords**
   - Base: "debt", "leverage", "borrowing", "liabilities"
   - Positive: "reduced", "paid down", "lowered", "decreased", "improved" (less debt is good)
   - Negative: "increased", "rose", "higher", "concerns" (more debt is bad)
   - Context: "ratio", "to equity", "covenant", "credit rating"

8. **Add Ambiguity Handling**
   - Some words flip meaning with negation: "not beat" → negative
   - Intensity modifiers: "significantly beat", "slightly missed"
   - Track common false positive patterns

**Verification Checklist:**
- [ ] All 6 aspects have base, positive, negative, and context keywords
- [ ] Keywords are lowercase for case-insensitive matching
- [ ] No significant overlap between positive and negative sets
- [ ] Context words help distinguish financial vs non-financial usage
- [ ] Keywords exported as typed constant

**Testing Instructions:**
- Create `__tests__/keywords.test.ts`
- Verify all aspects have non-empty keyword sets
- Check for contradictions (same word in positive and negative)
- Validate structure matches expected type

**Commit Message Template:**
```
feat(aspect-analyzer): add comprehensive aspect keyword library

- Define keyword sets for all 6 aspects
- Separate positive and negative polarity signals
- Add context words to prevent false positives
- Include financial terminology and abbreviations
- Add tests for keyword validation

Author & Committer: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com
```

**Estimated Tokens:** ~8,000

---

### Task 3: Implement Aspect Detection Engine

**Goal:** Build the core logic that finds aspect mentions in text and determines their polarity (positive/negative).

**Files to Create:**
- `backend/src/ml/aspects/detector.ts` - Aspect detection and polarity scoring
- `backend/src/ml/aspects/__tests__/detector.test.ts` - Unit tests

**Prerequisites:**
- Tasks 1 & 2 completed
- Understanding of text proximity matching
- Review of Phase-0 Design Pattern #3 (Type-First Development)

**Implementation Steps:**

1. **Create Sentence Extraction Function**
   - Split article text into sentences (same logic as event classifier)
   - Preserve sentence boundaries for context
   - Handle edge cases (abbreviations like "Q1", "U.S.")

2. **Implement Aspect Mention Detection**
   - Search sentences for aspect base keywords
   - Return sentence index and matched keyword
   - Support multi-word keywords ("top line", "net income")

3. **Implement Polarity Detection**
   - For each aspect mention, check surrounding words (±10 words)
   - Count positive signal words
   - Count negative signal words
   - Handle negation: "not strong" → flip polarity
   - Calculate polarity score: (positive - negative) / (positive + negative + 1)
   - Range: -1 (very negative) to +1 (very positive)

4. **Implement Confidence Scoring**
   - Confidence = number of signal words found / 5 (max confidence)
   - Cap at 1.0
   - Boost confidence if context words present
   - Reduce confidence if aspect keyword appears without any signals (neutral mention)

5. **Handle Negation Patterns**
   - Detect negation words: "not", "no", "never", "didn't", "doesn't", "won't"
   - If negation appears within 3 words before positive signal, flip to negative
   - Example: "did not beat estimates" → negative (despite "beat")

6. **Handle Intensity Modifiers**
   - Amplifiers: "significantly", "substantially", "dramatically" → multiply polarity by 1.5
   - Diminishers: "slightly", "marginally", "barely" → multiply polarity by 0.5

7. **Extract Matched Text**
   - Return the sentence containing the aspect mention
   - Used for debugging and UI display

**Verification Checklist:**
- [ ] `extractSentences(text)` splits on sentence boundaries
- [ ] `detectAspectMentions(sentences, aspect)` finds aspect keywords
- [ ] `detectPolarity(sentence, aspect)` returns score -1 to +1
- [ ] Negation handling flips polarity correctly
- [ ] Intensity modifiers adjust scores appropriately
- [ ] Confidence scoring works (0-1 range)
- [ ] Matched text extraction includes full sentence

**Testing Instructions:**
- Test with real financial article snippets (use fixtures)
- Test positive signals: "revenue grew 15%" → +0.7-0.9
- Test negative signals: "missed earnings" → -0.7 to -0.9
- Test negation: "did not beat" → negative
- Test intensity: "significantly beat" → higher score
- Test neutral mentions: "revenue was reported" → ~0.0
- Test edge cases: empty text, aspect not found

**Example Tests:**
```typescript
import { detectPolarity, detectAspectMentions } from '../detector';
import { ASPECT_KEYWORDS } from '../keywords';

describe('Aspect Detection', () => {
  describe('Polarity Detection', () => {
    it('should detect positive revenue signal', () => {
      const sentence = "Company reported revenue growth of 15%, beating estimates";
      const result = detectPolarity(sentence, 'REVENUE', ASPECT_KEYWORDS.REVENUE);

      expect(result.score).toBeGreaterThan(0.5);
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it('should detect negative earnings signal', () => {
      const sentence = "Earnings missed analyst expectations by 10%";
      const result = detectPolarity(sentence, 'EARNINGS', ASPECT_KEYWORDS.EARNINGS);

      expect(result.score).toBeLessThan(-0.5);
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it('should handle negation correctly', () => {
      const sentence = "Revenue did not beat expectations";
      const result = detectPolarity(sentence, 'REVENUE', ASPECT_KEYWORDS.REVENUE);

      // "beat" is positive, but "did not" flips it
      expect(result.score).toBeLessThan(0);
    });

    it('should handle intensity modifiers', () => {
      const normal = "Revenue beat estimates";
      const intense = "Revenue significantly beat estimates";

      const normalResult = detectPolarity(normal, 'REVENUE', ASPECT_KEYWORDS.REVENUE);
      const intenseResult = detectPolarity(intense, 'REVENUE', ASPECT_KEYWORDS.REVENUE);

      expect(intenseResult.score).toBeGreaterThan(normalResult.score);
    });

    it('should return neutral for aspect mention without signals', () => {
      const sentence = "The company reported revenue for Q1";
      const result = detectPolarity(sentence, 'REVENUE', ASPECT_KEYWORDS.REVENUE);

      expect(result.score).toBeCloseTo(0, 1);
      expect(result.confidence).toBeLessThan(0.3);
    });
  });
});
```

**Commit Message Template:**
```
feat(aspect-analyzer): implement aspect detection engine

- Add sentence extraction with boundary handling
- Implement aspect mention detection (multi-word support)
- Add polarity detection with proximity matching
- Handle negation patterns (flip polarity)
- Add intensity modifiers (amplify/diminish scores)
- Implement confidence scoring
- Include comprehensive unit tests

Author & Committer: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com
```

**Estimated Tokens:** ~15,000

---

### Task 4: Build Weighted Aspect Scoring Service

**Goal:** Create the main service that detects all aspects in an article, scores them individually, and combines them using materiality weights to produce the final aspect score.

**Files to Create:**
- `backend/src/services/aspectAnalysis.service.ts` - Main aspect analysis service
- `backend/src/services/__tests__/aspectAnalysis.service.test.ts` - Service tests

**Prerequisites:**
- Tasks 1, 2, 3 completed
- Understanding of weighted averages
- Review of Phase-0 ADR-003 (Aspect-Based Methodology)

**Implementation Steps:**

1. **Define Service Interface**
   - Input: `NewsArticle` (headline + summary)
   - Output: `AspectAnalysisResult` (overallScore, breakdown, confidence)
   - Async function for consistency with other services

2. **Implement Article Processing**
   - Combine headline and summary (weight headline 2x more)
   - Extract sentences
   - Prepare text for aspect detection

3. **Detect All Aspects**
   - Iterate through all 6 aspect types
   - For each aspect, detect mentions and polarity
   - Collect detected aspects with their scores

4. **Calculate Weighted Overall Score**
   - For each detected aspect, multiply its score by its weight
   - Sum weighted scores
   - Normalize to -1 to +1 range
   - Formula:
     ```
     overallScore = Σ(aspectScore × aspectWeight) / Σ(detectedAspectWeights)
     ```
   - Only include weights for aspects actually detected

5. **Calculate Overall Confidence**
   - Average confidence across all detected aspects
   - Boost if multiple aspects detected (more signals = more confidence)
   - Reduce if only one aspect detected (limited view)

6. **Handle No Aspects Detected**
   - If no aspects found, return score = 0, confidence = 0
   - Log warning for debugging
   - This is valid for general news (not financial)

7. **Build Aspect Breakdown**
   - Include individual scores for all detected aspects
   - Omit aspects not found (keep breakdown clean)
   - Store matched text for each aspect (UI display)

**Verification Checklist:**
- [ ] `analyzeAspects(article)` returns AspectAnalysisResult
- [ ] Weighted scoring uses ASPECT_WEIGHTS correctly
- [ ] Overall score normalized to -1 to +1
- [ ] Breakdown includes only detected aspects
- [ ] Confidence calculation accounts for multiple aspects
- [ ] No-aspects case handled gracefully
- [ ] Headline weighted more than summary

**Testing Instructions:**
- Create realistic test articles with known aspect signals
- Test single-aspect articles (e.g., only revenue mentioned)
- Test multi-aspect articles (revenue + earnings + guidance)
- Test mixed sentiment (revenue positive, earnings negative)
- Test no-aspects article (general news)
- Verify weighted scoring math manually

**Example Tests:**
```typescript
import { analyzeAspects } from '../aspectAnalysis.service';
import { ASPECT_WEIGHTS } from '../../types/aspect.types';

describe('Aspect Analysis Service', () => {
  describe('Single Aspect Detection', () => {
    it('should analyze revenue-only article', async () => {
      const article = {
        ticker: 'AAPL',
        headline: 'Apple Reports Strong Revenue Growth',
        summary: 'Apple Inc. revenue grew 15%, beating analyst estimates of 12%.'
      };

      const result = await analyzeAspects(article);

      expect(result.breakdown.REVENUE).toBeGreaterThan(0.5);
      expect(result.overallScore).toBeGreaterThan(0.5);
      expect(result.breakdown.EARNINGS).toBeUndefined(); // Not mentioned
    });
  });

  describe('Multi-Aspect Detection', () => {
    it('should handle mixed sentiment across aspects', async () => {
      const article = {
        ticker: 'TSLA',
        headline: 'Tesla Beats Revenue But Misses EPS',
        summary: 'Tesla reported revenue growth of 20% but earnings fell short of expectations.'
      };

      const result = await analyzeAspects(article);

      // Revenue should be positive
      expect(result.breakdown.REVENUE).toBeGreaterThan(0);

      // Earnings should be negative
      expect(result.breakdown.EARNINGS).toBeLessThan(0);

      // Overall should be weighted combination
      const expectedScore =
        (result.breakdown.REVENUE! * ASPECT_WEIGHTS.REVENUE +
         result.breakdown.EARNINGS! * ASPECT_WEIGHTS.EARNINGS) /
        (ASPECT_WEIGHTS.REVENUE + ASPECT_WEIGHTS.EARNINGS);

      expect(result.overallScore).toBeCloseTo(expectedScore, 1);
    });

    it('should weight earnings more than growth', async () => {
      const article = {
        ticker: 'AAPL',
        headline: 'Apple: Strong Earnings, Slowing Growth',
        summary: 'Earnings surged 30% but growth rate decelerated to 5%.'
      };

      const result = await analyzeAspects(article);

      // Earnings positive (30% weight)
      expect(result.breakdown.EARNINGS).toBeGreaterThan(0);

      // Growth negative (5% weight)
      expect(result.breakdown.GROWTH).toBeLessThan(0);

      // Overall should be positive (earnings weight > growth weight)
      expect(result.overallScore).toBeGreaterThan(0);
    });
  });

  describe('No Aspects Detected', () => {
    it('should return zero score for general news', async () => {
      const article = {
        ticker: 'AAPL',
        headline: 'Apple CEO Speaks at Conference',
        summary: 'Tim Cook discussed the future of technology at a recent event.'
      };

      const result = await analyzeAspects(article);

      expect(result.overallScore).toBe(0);
      expect(result.confidence).toBe(0);
      expect(Object.keys(result.breakdown)).toHaveLength(0);
    });
  });

  describe('Headline Weighting', () => {
    it('should weight headline more than summary', async () => {
      const headlineArticle = {
        ticker: 'AAPL',
        headline: 'Apple Revenue Beats Estimates',
        summary: 'The company also reported other results.'
      };

      const summaryArticle = {
        ticker: 'AAPL',
        headline: 'Apple Reports Quarterly Results',
        summary: 'Revenue beat estimates significantly.'
      };

      const headlineResult = await analyzeAspects(headlineArticle);
      const summaryResult = await analyzeAspects(summaryArticle);

      // Headline mention should have higher impact
      expect(headlineResult.overallScore).toBeGreaterThan(summaryResult.overallScore);
    });
  });
});
```

**Commit Message Template:**
```
feat(aspect-analyzer): add weighted aspect scoring service

- Implement main analyzeAspects service function
- Add weighted scoring using materiality weights
- Calculate overall score from detected aspects
- Build aspect breakdown for UI display
- Handle mixed sentiment and no-aspects cases
- Weight headline 2x more than summary
- Include comprehensive test coverage

Author & Committer: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com
```

**Estimated Tokens:** ~18,000

---

### Task 5: Integrate with Event Classification

**Goal:** Connect aspect analysis with event classification to only analyze aspects for relevant event types (e.g., don't analyze earnings aspects for product launch articles).

**Files to Modify:**
- `backend/src/services/aspectAnalysis.service.ts` - Add event type filtering
- `backend/src/services/__tests__/aspectAnalysis.service.test.ts` - Update tests

**Prerequisites:**
- Task 4 completed
- Phase 1 completed (event classification working)
- Understanding of which aspects matter for which events

**Implementation Steps:**

1. **Define Event-Aspect Mapping**
   - EARNINGS events → analyze all 6 aspects
   - M&A events → analyze DEBT, REVENUE (financial health)
   - GUIDANCE events → analyze REVENUE, EARNINGS, MARGINS (forward-looking)
   - ANALYST_RATING events → analyze all aspects (comprehensive view)
   - PRODUCT_LAUNCH → analyze REVENUE, GROWTH only
   - GENERAL → analyze all aspects (unknown relevance)

2. **Add Event Type Parameter**
   - Update `analyzeAspects` to accept optional `eventType`
   - Filter aspects based on event type before detection
   - Default: analyze all aspects if event type not provided

3. **Implement Aspect Filtering**
   - Create helper function: `getRelevantAspects(eventType)`
   - Returns subset of aspects to analyze
   - Reduces processing time for non-earnings events

4. **Adjust Weight Normalization**
   - When filtering aspects, renormalize weights to sum to 1.0
   - Example: If only analyzing REVENUE (25%) and EARNINGS (30%):
     - New weights: REVENUE = 25/(25+30) = 45%, EARNINGS = 55%

5. **Update Integration Points**
   - Ensure sentiment processing pipeline passes event type to aspect analysis
   - Maintain backward compatibility (works without event type)

**Verification Checklist:**
- [ ] `getRelevantAspects(eventType)` returns correct aspect subset
- [ ] Weights renormalized when aspects filtered
- [ ] `analyzeAspects` accepts optional eventType parameter
- [ ] Processing time reduced for non-earnings events
- [ ] Tests cover all event types
- [ ] Backward compatible (works without event type)

**Testing Instructions:**
- Test aspect filtering for each event type
- Verify weight renormalization math
- Test performance improvement (faster for filtered events)
- Ensure no aspects analyzed for irrelevant events

**Example Tests:**
```typescript
describe('Event-Aspect Integration', () => {
  it('should analyze all aspects for earnings events', async () => {
    const article = mockEarningsArticle();
    const result = await analyzeAspects(article, 'EARNINGS');

    // All aspects should be checked
    expect(result.aspectsAnalyzed).toBe(6);
  });

  it('should analyze limited aspects for product launch', async () => {
    const article = mockProductLaunchArticle();
    const result = await analyzeAspects(article, 'PRODUCT_LAUNCH');

    // Only revenue and growth relevant
    expect(result.aspectsAnalyzed).toBe(2);
  });

  it('should renormalize weights when filtering', async () => {
    const article = {
      headline: 'Revenue grew 15%', // Only revenue mentioned
      summary: ''
    };

    const earningsResult = await analyzeAspects(article, 'EARNINGS'); // All aspects
    const productResult = await analyzeAspects(article, 'PRODUCT_LAUNCH'); // Revenue + growth only

    // Product launch should have higher revenue weight (renormalized)
    expect(productResult.overallScore).toBeGreaterThanOrEqual(earningsResult.overallScore);
  });
});
```

**Commit Message Template:**
```
feat(aspect-analyzer): integrate with event classification

- Add event-aspect relevance mapping
- Filter aspects based on event type
- Renormalize weights when aspects filtered
- Add eventType parameter to analyzeAspects
- Improve performance for non-earnings events
- Maintain backward compatibility
- Add tests for event-specific analysis

Author & Committer: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com
```

**Estimated Tokens:** ~12,000

---

### Task 6: Integrate with Sentiment Processing Pipeline

**Goal:** Add aspect analysis as the second signal in the sentiment processing pipeline, running after event classification and before DistilFinBERT.

**Files to Modify:**
- `backend/src/services/sentimentProcessing.service.ts` - Add aspect analysis step
- `backend/src/services/__tests__/sentimentProcessing.service.simple.test.ts` - Update tests

**Prerequisites:**
- Task 5 completed
- Phase 1 integrated (event classification in pipeline)
- Understanding of processing pipeline flow

**Implementation Steps:**

1. **Add Aspect Analysis to Pipeline**
   - After event classification, call `analyzeAspects`
   - Pass event type to aspect analyzer
   - Store aspect score in processing result

2. **Update Result Interfaces**
   - Add `aspectScore` to `SentimentProcessingResult`
   - Add `aspectBreakdown` (optional detailed scores)
   - Ensure backward compatibility

3. **Handle Analysis Errors**
   - If aspect analysis fails, default to score = 0
   - Log error but continue processing
   - Don't block sentiment analysis on aspect failures

4. **Add Performance Tracking**
   - Time aspect analysis separately
   - Log if aspect analysis takes >30ms
   - Track average aspect analysis time

5. **Update Processing Flow**
   ```
   OLD: Fetch → Analyze Sentiment → Cache
   NEW: Fetch → Classify Event → Analyze Aspects → Analyze Sentiment → Cache
   ```

6. **Optimize for Batch Processing**
   - Analyze aspects in parallel where possible
   - Don't wait for aspect analysis to start sentiment analysis
   - Use Promise.all for concurrent processing

**Verification Checklist:**
- [ ] Aspect analysis runs after event classification
- [ ] Aspect score included in processing result
- [ ] Error handling prevents pipeline failures
- [ ] Performance tracking logs slow analyses
- [ ] Tests verify aspect scores present
- [ ] Backward compatibility maintained

**Testing Instructions:**
- Integration test: Process full batch, verify all articles have aspect scores
- Error test: Mock aspect analysis failure, verify pipeline continues
- Performance test: Verify aspect analysis adds <30ms average
- Test with various event types

**Example Tests:**
```typescript
import { processSentimentForTicker } from '../sentimentProcessing.service';
import * as AspectAnalysis from '../aspectAnalysis.service';

describe('Sentiment Pipeline with Aspect Analysis', () => {
  it('should include aspect scores in results', async () => {
    const result = await processSentimentForTicker(
      'AAPL',
      '2025-01-01',
      '2025-01-30'
    );

    result.dailySentiment.forEach(item => {
      expect(item).toHaveProperty('aspectScore');
      expect(typeof item.aspectScore).toBe('number');
      expect(item.aspectScore).toBeGreaterThanOrEqual(-1);
      expect(item.aspectScore).toBeLessThanOrEqual(1);
    });
  });

  it('should handle aspect analysis errors gracefully', async () => {
    jest.spyOn(AspectAnalysis, 'analyzeAspects')
      .mockRejectedValue(new Error('Aspect analysis failed'));

    // Should not throw, should default to 0
    const result = await processSentimentForTicker(
      'AAPL',
      '2025-01-01',
      '2025-01-30'
    );

    result.dailySentiment.forEach(item => {
      expect(item.aspectScore).toBe(0);
    });
  });

  it('should pass event type to aspect analyzer', async () => {
    const analyzeSpy = jest.spyOn(AspectAnalysis, 'analyzeAspects');

    await processSentimentForTicker('AAPL', '2025-01-01', '2025-01-30');

    // Verify aspect analyzer received event type
    expect(analyzeSpy).toHaveBeenCalledWith(
      expect.any(Object),
      expect.stringMatching(/EARNINGS|M&A|GUIDANCE|ANALYST_RATING|PRODUCT_LAUNCH|GENERAL/)
    );
  });
});
```

**Commit Message Template:**
```
feat(aspect-analyzer): integrate with sentiment pipeline

- Add aspect analysis step after event classification
- Store aspect scores in processing results
- Add error handling to prevent pipeline failures
- Track aspect analysis performance
- Optimize for batch processing with parallel execution
- Update tests to verify aspect integration

Author & Committer: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com
```

**Estimated Tokens:** ~13,000

---

### Task 7: Add Aspect Analysis Documentation

**Goal:** Document the aspect analysis system with keyword lists, weighting rationale, and usage examples for future maintainers.

**Files to Create:**
- `backend/docs/aspect-analysis.md` - System documentation
- `backend/src/ml/aspects/examples/` - Example articles with expected scores

**Prerequisites:**
- All previous tasks completed
- System validated with real articles

**Implementation Steps:**

1. **Write System Overview**
   - Explain aspect-based sentiment concept
   - List the 6 aspects and their definitions
   - Document weighting rationale (why earnings 30%, revenue 25%, etc.)

2. **Document Keyword Sets**
   - List all base keywords, positive signals, negative signals per aspect
   - Explain context requirements
   - Note common false positives

3. **Document Scoring Algorithm**
   - Explain polarity detection (positive - negative signals)
   - Document weighted averaging formula
   - Explain confidence calculation

4. **Provide Usage Examples**
   - Code examples for calling `analyzeAspects`
   - Example articles with expected scores
   - Integration with event classification

5. **Create Test Fixtures**
   - JSON files with realistic articles for each aspect combination
   - Include expected scores for validation
   - Use in automated tests and manual verification

6. **Add Maintenance Guide**
   - How to add new aspects
   - How to adjust weights
   - How to add new keywords
   - How to evaluate accuracy

**Verification Checklist:**
- [ ] Documentation covers all 6 aspects
- [ ] Keyword lists comprehensive and current
- [ ] Weighting rationale explained
- [ ] Code examples runnable
- [ ] Test fixtures for all aspects
- [ ] Maintenance guide actionable

**Commit Message Template:**
```
docs(aspect-analyzer): add comprehensive documentation

- Document aspect-based sentiment system
- List keywords and polarity signals per aspect
- Explain weighted scoring algorithm
- Provide usage examples and code snippets
- Create test fixtures for validation
- Add maintenance guide for updates

Author & Committer: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com
```

**Estimated Tokens:** ~6,000

---

## Phase Verification

### Complete Phase Checklist

Before proceeding to Phase 3:

- [ ] All 7 tasks completed and committed
- [ ] All tests passing
- [ ] TypeScript compiles without errors
- [ ] Aspect detection achieves 90%+ polarity accuracy on test fixtures
- [ ] Weighted scoring math verified manually
- [ ] Aspect analysis adds <30ms per article
- [ ] Integration with event classification working
- [ ] Integration with sentiment pipeline working
- [ ] Documentation complete

### Integration Test

```typescript
describe('Phase 2 Integration Test', () => {
  it('should analyze aspects for earnings article', async () => {
    const article = {
      ticker: 'AAPL',
      headline: 'Apple Beats Earnings, Misses Revenue',
      summary: 'Apple reported EPS of $1.30 vs $1.20 expected, but revenue of $90B vs $92B expected.'
    };

    const eventType = await classifyEvent(article);
    const aspectResult = await analyzeAspects(article, eventType);

    // Should detect earnings (positive) and revenue (negative)
    expect(aspectResult.breakdown.EARNINGS).toBeGreaterThan(0);
    expect(aspectResult.breakdown.REVENUE).toBeLessThan(0);

    // Overall should be positive (earnings weighted higher)
    expect(aspectResult.overallScore).toBeGreaterThan(0);
  });
});
```

### Known Limitations

- Keyword-based detection can miss complex phrasings
- Negation handling limited to simple patterns
- Intensity modifiers fixed (not learned)
- No cross-aspect relationships (e.g., "revenue up but margins down due to costs")

These will be partially addressed by DistilFinBERT in Phase 3.

---

## Next Steps

Proceed to:
- [Phase 3: DistilFinBERT Integration](./Phase-3.md)
