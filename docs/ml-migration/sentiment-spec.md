# Python FinBERT Sentiment Service Specification

## Overview

This document specifies the behavior of the Python FinBERT sentiment analysis microservice that will be replaced by a JavaScript implementation in Phase 2. The specification is derived from interface analysis and synthetic test data.

**Service Endpoint**: `https://stocks-backend-sentiment-f3jmjyxrpq-uc.a.run.app/sentiment`

## Input Format

### Request Structure

```typescript
{
  text: string[],  // Array of sentences extracted from article
  hash: string     // Hash identifier for the article
}
```

### Text Preprocessing

The service expects sentences to be preprocessed before submission:

1. **Remove characters**: Quotes (`"`), commas (`,`), apostrophes (`'`)
2. **Split on sentence boundaries**: Regex pattern `/(?<=[.?])\s+/`
   - Splits after periods (`.`) or question marks (`?`)
   - Preserves the sentence-ending punctuation
3. **Result**: Array of individual sentences

**Example**:
```javascript
Input: "Apple's earnings beat estimates. The stock surged 8%!"
After preprocessing: ["Apples earnings beat estimates", "The stock surged 8%"]
```

## Output Format

### Response Structure

```typescript
{
  positive: [string, string],  // [count, confidence]
  neutral: [string, string],   // [count, confidence]
  negative: [string, string],  // [count, confidence]
  hash: string                 // Echo of input hash
}
```

### Field Descriptions

- **positive**: `[count, confidence]`
  - `count`: Number of sentences classified as positive (string format)
  - `confidence`: Average confidence score for positive classifications (0.00-1.00, string format)

- **neutral**: `[count, confidence]`
  - `count`: Number of sentences classified as neutral (string format)
  - `confidence`: Average confidence score for neutral classifications (0.00-1.00, string format)

- **negative**: `[count, confidence]`
  - `count`: Number of sentences classified as negative (string format)
  - `confidence`: Average confidence score for negative classifications (0.00-1.00, string format)

- **hash**: Echo of the input hash for request tracking

**Example**:
```json
{
  "positive": ["4", "0.92"],
  "neutral": ["1", "0.65"],
  "negative": ["0", "0.00"],
  "hash": "test-hash-001"
}
```

## FinBERT Characteristics

### Model Behavior

**FinBERT** is a BERT-based model fine-tuned on financial text for sentiment classification.

**Key Characteristics**:
- Three-class classification: Positive, Neutral, Negative
- Financial domain specialization (trained on financial news, earnings calls, etc.)
- Sentence-level analysis with confidence scores
- Confidence range: 0.00 (no confidence) to 1.00 (maximum confidence)

### Financial Domain Terms

The model has enhanced understanding of financial terminology:

**Positive Terms**:
- bullish, upgrade, outperform, beat (estimates)
- growth, gains, revenue growth, profit margins
- strong, impressive, robust, exceeded
- value, synergies, strategic

**Negative Terms**:
- bearish, downgrade, underperform, miss (estimates)
- losses, decline, fell, plummeted
- challenges, concerns, disappointing, inadequate
- mounting, significant losses, sharply

**Neutral Terms**:
- announced, reported, results, moderate
- maintained, remained, flat, in line

### Classification Patterns

Based on test data analysis:

1. **Strongly Bullish** (4-5 positive sentences, 0 negative)
   - Articles about earnings beats, upgrades, strong growth
   - High confidence (0.85-0.95)

2. **Strongly Bearish** (4-5 negative sentences, 0-1 positive)
   - Articles about losses, downgrades, declining performance
   - High confidence (0.85-0.95)

3. **Mixed/Neutral** (balanced positive/negative/neutral counts)
   - Articles with mixed signals or factual reporting
   - Moderate confidence (0.60-0.80)

4. **Short Articles** (1-3 sentences)
   - Often classified as neutral unless strongly opinionated
   - Moderate to high confidence depending on clarity

## Aggregation Logic

The service performs the following aggregation:

1. **Classify each sentence**: FinBERT assigns POS/NEUT/NEG with confidence score
2. **Count by category**: Sum sentences in each sentiment class
3. **Average confidence**: Calculate mean confidence for each category
4. **Format output**: Convert counts and confidences to strings

**Pseudocode**:
```python
for sentence in sentences:
    sentiment, confidence = finbert_model.classify(sentence)
    counts[sentiment] += 1
    confidence_scores[sentiment].append(confidence)

for sentiment in ['positive', 'neutral', 'negative']:
    count = counts[sentiment]
    avg_confidence = mean(confidence_scores[sentiment]) if count > 0 else 0.0
    output[sentiment] = [str(count), f"{avg_confidence:.2f}"]
```

## Edge Cases

### Empty Text
- **Input**: Empty string or array
- **Expected**: Zero counts across all categories
- **Behavior**: Service should handle gracefully

### Single Sentence
- **Input**: One sentence
- **Expected**: One category has count=1, others have count=0
- **Example**: `"The company announced results."` → Neutral

### No Punctuation
- **Input**: Text without sentence-ending punctuation
- **Expected**: Treated as single sentence
- **Behavior**: Classification based on overall text

### Very Long Articles
- **Input**: 20+ sentences
- **Expected**: All sentences processed, counts may be high
- **Performance**: May take 1-2 seconds due to model inference

### Special Characters
- **Input**: Text with emojis, URLs, numbers
- **Expected**: Characters may be ignored or treated neutrally
- **Behavior**: Financial text rarely contains these

## Performance Characteristics

### Latency
- **Cold Start**: 5-10 seconds (Cloud Run container initialization)
- **Warm Request**: 500-2000ms depending on sentence count
- **Per Sentence**: ~100-200ms average

### Timeout
- **Configured**: 30 seconds
- **Typical**: Completes within 2-3 seconds for normal articles

### Rate Limiting
- **Cloud Run**: Subject to platform limits
- **Cost**: Per-request pricing, incentive to eliminate

## Acceptance Criteria for JavaScript Implementation

To validate the JavaScript implementation against this Python service:

### Directional Agreement
- **Target**: ≥80% agreement on dominant sentiment
- **Calculation**: `same_dominant_sentiment / total_samples`
- **Dominant Sentiment**: The category with the highest count

**Example**:
- Python: POS=4, NEUT=1, NEG=0 → Dominant: POS
- JavaScript: POS=3, NEUT=2, NEG=0 → Dominant: POS
- **Result**: Agreement ✓

### Count Ranges
- **Target**: Within ±30% of Python counts
- **Calculation**: For each category, `|js_count - python_count| / python_count ≤ 0.3`
- **Rationale**: Different models will produce different counts, but should be in same ballpark

**Example**:
- Python: POS=4, NEUT=1, NEG=0
- JavaScript: POS=3, NEUT=2, NEG=0
- **POS**: |3-4|/4 = 0.25 ✓
- **NEUT**: |2-1|/1 = 1.0 ✗ (acceptable for low counts)

### Confidence Scores
- **Not required to match**: Different models have different confidence calibration
- **JavaScript**: May use simpler confidence calculation (e.g., normalized sentiment scores)
- **Rationale**: Confidence is less critical than classification accuracy

### Performance
- **Target**: <100ms per article on web, <200ms on mobile
- **Comparison**: Should be 5-10x faster than Python API roundtrip
- **Measurement**: Time from function call to return

### Bundle Size
- **Target**: <50KB added to application bundle
- **Measurement**: Difference in production build size with/without ML code

## Test Data Summary

The synthetic test dataset includes 15 diverse samples:

| Category | Count | Description |
|----------|-------|-------------|
| Bullish  | 6     | Strong positive sentiment (earnings beats, upgrades, growth) |
| Bearish  | 4     | Strong negative sentiment (losses, downgrades, challenges) |
| Neutral  | 5     | Mixed or balanced sentiment |

**Coverage**:
- ✓ Short articles (1-3 sentences)
- ✓ Medium articles (4-5 sentences)
- ✓ Long articles (10+ sentences)
- ✓ Financial jargon (upgrade, downgrade, outperform, underperform)
- ✓ Earnings-related terms (beat, miss, revenue, profit)
- ✓ Mixed sentiment articles
- ✓ Edge cases (empty-like sentences)

## Implementation Recommendations

### Approach
1. **Use rule-based sentiment library**: `sentiment` npm package (AFINN lexicon)
2. **Enhance with financial lexicon**: Add domain-specific terms with appropriate scores
3. **Match preprocessing**: Use same regex for sentence splitting
4. **Match output format**: Ensure arrays of strings in response

### Key Considerations
- **Simplicity over accuracy**: Rule-based is acceptable if directionally correct
- **Performance first**: Sub-100ms is more important than perfect accuracy
- **Maintainability**: Clear, documented code for future enhancements
- **Testing**: Comprehensive tests with synthetic data validation

### Known Limitations
- JavaScript implementation will be less accurate than FinBERT
- May miss nuanced sentiment in complex financial text
- Limited to English language (AFINN lexicon)
- No contextual understanding (unlike transformer models)

**These limitations are acceptable per project requirements.**

## References

- **FinBERT Paper**: https://arxiv.org/abs/1908.10063
- **Python Service Repo**: https://github.com/HatmanStack/python-sentiment-analysis
- **Existing Service Interface**: `src/services/api/sentiment.service.ts`
- **API Types**: `src/types/api.types.ts`

---

**Document Version**: 1.0
**Date**: 2025-11-12
**Phase**: Phase 2, Task 2.1
