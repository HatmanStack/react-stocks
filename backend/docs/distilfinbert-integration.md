# DistilFinBERT Integration Guide

Complete guide for the DistilFinBERT sentiment analysis integration in the React Stocks backend.

## Overview

DistilFinBERT provides sophisticated contextual sentiment analysis for financial news articles. It's the third and most accurate signal in our multi-signal sentiment analysis system, complementing event classification and aspect-based analysis.

## Architecture

### Three-Signal System

The sentiment analysis pipeline provides three independent signals:

1. **Event Classification** (Categorical)
   - Values: `EARNINGS`, `M&A`, `PRODUCT_LAUNCH`, `ANALYST_RATING`, `GUIDANCE`, `GENERAL`
   - Purpose: Categorize article type
   - Implementation: Rule-based keyword matching

2. **Aspect Score** (Numerical: -1 to +1)
   - Analyzes key financial aspects: revenue, EPS, guidance, margins
   - Purpose: Capture mixed signals (e.g., revenue beat but margin miss)
   - Implementation: Financial keyword extraction + weighted scoring

3. **DistilFinBERT Sentiment** (Numerical: -1 to +1)
   - Contextual sentiment using transformer model
   - Purpose: Sophisticated understanding of nuance and context
   - Implementation: External Python service (AWS Lambda)

### Tiered Processing Strategy

DistilFinBERT only runs on "material events" to balance accuracy with performance:

```
Article → Event Classification
           ↓
    Material Event? (EARNINGS, M&A, GUIDANCE, ANALYST_RATING)
           ↓
    YES: DistilFinBERT + Aspect Analysis
    NO:  Bag-of-words only
```

**Expected Distribution:**
- ~20-30% of articles are material events (invoke DistilFinBERT)
- ~70-80% are general news (fast bag-of-words only)

This hybrid approach provides sophisticated analysis where it matters while maintaining performance.

## Components

### 1. DistilFinBERT Service (Python Lambda)

**Location:** `distilfinbert-service/`

**Deployment:** AWS Lambda with API Gateway HTTP API

**Endpoints:**
- `POST /sentiment` - Analyze single text
- `POST /sentiment/batch` - Analyze up to 10 texts
- `GET /health` - Health check

**Model:** ProsusAI/FinBERT (distilled BERT fine-tuned on financial news)

**Performance:**
- Cold start: 5-10 seconds
- Warm response: <500ms
- Memory: 2048MB Lambda

### 2. DistilFinBERT Client (Node.js Backend)

**Location:** `backend/src/services/distilFinBERT.service.ts`

**Features:**
- Exponential backoff retry (3 attempts: 1s, 2s, 4s delays)
- 5-second timeout per request
- Validates sentiment scores (-1 to +1 range)
- Returns null on failure (triggers fallback)

**Usage:**
```typescript
import { getDistilFinBERTSentiment } from './distilFinBERT.service';

const score = await getDistilFinBERTSentiment(articleText);
// Returns: -1 to +1, or null on error
```

### 3. Sentiment Processing Pipeline

**Location:** `backend/src/services/sentimentProcessing.service.ts`

**Integration Point:** After event classification and aspect analysis, before storing to cache.

**Flow:**
```typescript
// 1. Classify events (all articles)
const eventType = await classifyEvent(article);

// 2. Analyze aspects (all articles)
const aspectScore = await analyzeAspects(article);

// 3. DistilFinBERT (material events only)
let distilFinBERTScore = null;
if (isMaterialEvent(eventType)) {
  distilFinBERTScore = await getDistilFinBERTSentiment(article.text);
  // Falls back to bag-of-words if service fails
}

// 4. Store all signals in cache
await cacheSentiment({
  eventType,
  aspectScore,
  distilFinBERTScore, // undefined for non-material events
  sentiment: bagOfWordsResult
});
```

### 4. Sentiment Cache Schema

**Location:** `backend/src/repositories/sentimentCache.repository.ts`

**Extended Schema:**
```typescript
interface SentimentCacheItem {
  ticker: string;
  articleHash: string;
  sentiment: SentimentData; // Bag-of-words (backward compat)
  analyzedAt: number;
  ttl: number;

  // Phase 1
  eventType?: string;

  // Phase 2
  aspectScore?: number;
  aspectBreakdown?: AspectBreakdown;

  // Phase 3
  distilFinBERTScore?: number; // NEW: Only for material events
  modelVersion?: string;        // NEW: Track model version
}
```

All new fields are optional for backward compatibility.

### 5. Performance Monitoring

**Location:** `backend/src/utils/metrics.util.ts`

**CloudWatch Metrics:**
- `DistilFinBERTCalls` - Total API calls
- `DistilFinBERTDuration` - Response time
- `DistilFinBERTSuccessRate` - % successful calls
- `DistilFinBERTCacheHitRate` - % cached results
- `DistilFinBERTFallbackRate` - % fallback to bag-of-words
- `DistilFinBERTMaterialEventRate` - % articles invoking DistilFinBERT

**Usage:**
```typescript
import { logDistilFinBERTBatch } from '../utils/metrics.util';

logDistilFinBERTBatch(
  ticker,
  totalArticles,
  materialEvents,
  successCount,
  avgDurationMs
);
```

## Configuration

### Environment Variables

**Backend Lambda:**
```bash
DISTILFINBERT_API_URL=https://<api-id>.execute-api.us-east-1.amazonaws.com/prod
```

Set via SAM template or AWS Console.

**DistilFinBERT Service:**
```bash
MODEL_NAME=ProsusAI/finbert
MODEL_CACHE_DIR=/tmp/models
LOG_LEVEL=INFO
```

Set in `distilfinbert-service/template.yaml`.

## Deployment

### Prerequisites
- Backend Lambda deployed
- AWS CLI configured
- SAM CLI installed
- Docker running

### Deploy DistilFinBERT Service

```bash
cd distilfinbert-service
./deploy.sh
```

This will:
1. Build Docker image
2. Push to ECR
3. Deploy Lambda with SAM
4. Output API Gateway URL

### Update Backend Configuration

Add DistilFinBERT API URL to backend environment:

```bash
# Get API URL from DistilFinBERT stack
API_URL=$(aws cloudformation describe-stacks \
  --stack-name distilfinbert-prod \
  --query 'Stacks[0].Outputs[?OutputKey==`DistilFinBERTApiUrl`].OutputValue' \
  --output text)

# Update backend Lambda
aws lambda update-function-configuration \
  --function-name stocks-backend-prod \
  --environment Variables="{DISTILFINBERT_API_URL=${API_URL}}"
```

Or add to `backend/template.yaml`:
```yaml
Environment:
  Variables:
    DISTILFINBERT_API_URL: https://<api-id>.execute-api.us-east-1.amazonaws.com/prod
```

## Testing

### Unit Tests

```bash
cd backend
npm test -- src/services/__tests__/distilFinBERT.service.test.ts
```

Tests cover:
- Successful requests
- Retry logic with exponential backoff
- Timeout handling
- Error handling (network, 4xx, 5xx)
- Response validation
- Fallback behavior

### Integration Tests

Test end-to-end sentiment processing:

```bash
npm test -- src/services/__tests__/sentimentProcessing.service.simple.test.ts
```

### Manual Testing

Test DistilFinBERT service directly:

```bash
API_URL="https://<api-id>.execute-api.us-east-1.amazonaws.com/prod"

# Health check
curl ${API_URL}/health

# Sentiment analysis
curl -X POST ${API_URL}/sentiment \
  -H "Content-Type: application/json" \
  -d '{"text":"Apple reports record earnings, beating estimates by 15%"}'
```

Expected response:
```json
{
  "sentiment": 0.85,
  "confidence": 0.92,
  "label": "positive",
  "probabilities": {
    "negative": 0.03,
    "neutral": 0.05,
    "positive": 0.92
  }
}
```

## Monitoring

### CloudWatch Logs

View DistilFinBERT service logs:
```bash
sam logs --stack-name distilfinbert-prod --tail
```

View backend sentiment processing logs:
```bash
aws logs tail /aws/lambda/stocks-backend-prod --follow --filter-pattern "DistilFinBERT"
```

### CloudWatch Metrics

Dashboard: ReactStocks > DistilFinBERT

Key metrics to monitor:
1. **API Call Rate** - Should stay low with caching (target: <100/hour)
2. **Success Rate** - Should be high (target: >95%)
3. **Average Duration** - Should be fast (target: <500ms warm, <2s cold)
4. **Cache Hit Rate** - Should be high (target: >80%)
5. **Material Event Rate** - Should be ~20-30% of articles
6. **Fallback Rate** - Should be low (target: <5%)

### Alarms

Configured automatically in `distilfinbert-service/template.yaml`:

- **DistilFinBERTErrorsAlarm** - Triggers if error rate >5%
- **DistilFinBERTDurationAlarm** - Triggers if avg duration >10s
- **DistilFinBERTThrottlesAlarm** - Triggers on any throttling

## Troubleshooting

### Issue: High Fallback Rate

**Symptoms:** `DistilFinBERTFallbackRate` > 10%

**Possible Causes:**
1. DistilFinBERT service down
2. Network issues
3. Timeout too aggressive (5s)

**Solutions:**
1. Check DistilFinBERT service health: `curl ${API_URL}/health`
2. Check CloudWatch logs for errors
3. Increase timeout if needed (in `distilFinBERT.service.ts`)

### Issue: Slow Sentiment Processing

**Symptoms:** Sentiment processing takes >5 seconds for 30 articles

**Analysis:**
```bash
# Check DistilFinBERT duration
aws logs filter-log-events \
  --log-group-name /aws/lambda/stocks-backend-prod \
  --filter-pattern "DistilFinBERT analysis performance"
```

**Solutions:**
1. Verify cache is working (check cache hit rate)
2. Check if too many material events (>50%)
3. Consider provisioned concurrency for DistilFinBERT Lambda

### Issue: High DistilFinBERT Costs

**Expected Cost:** ~$5-10/month for 10k requests/day with 80% cache hit

**If costs are high:**
1. Check cache hit rate (should be >80%)
2. Verify TTL is 30 days (not shorter)
3. Check material event rate (should be ~20-30%)
4. Look for repeated analysis of same articles (cache bypass)

**Analysis:**
```bash
# Check DistilFinBERT invocation count
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=distilfinbert-sentiment-prod \
  --start-time $(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 86400 \
  --statistics Sum
```

### Issue: DistilFinBERT Service Cold Starts

**Symptoms:** First request takes >10 seconds

**Solutions:**
1. **Provisioned Concurrency:**
   ```bash
   aws lambda put-provisioned-concurrency-config \
     --function-name distilfinbert-sentiment-prod \
     --provisioned-concurrent-executions 1
   ```
   Cost: ~$10/month for 1 always-warm instance

2. **Pre-download Model in Docker Image:**
   Add to Dockerfile:
   ```dockerfile
   RUN python -c "from app.model import load_model; load_model()"
   ```
   Increases image size but speeds cold starts

## Performance Characteristics

### Expected Performance

| Metric | Target | Typical |
|--------|--------|---------|
| Cache hit rate | >80% | 85-90% |
| DistilFinBERT duration (warm) | <500ms | 300-450ms |
| DistilFinBERT duration (cold) | <10s | 5-8s |
| Success rate | >95% | 98-99% |
| Material event rate | 20-30% | 25% |
| Fallback rate | <5% | 1-2% |

### Cost Estimation

Assuming 10,000 articles/day, 25% material events, 80% cache hit rate:

- Material events: 2,500/day
- DistilFinBERT calls (after cache): 500/day = 15k/month
- Lambda cost: ~$3/month (2GB memory, 500ms avg)
- API Gateway cost: ~$0.50/month (15k requests)
- **Total: ~$3.50/month**

## Best Practices

1. **Monitor cache hit rate** - High hit rate = low costs
2. **Set appropriate TTL** - 30 days for DistilFinBERT results (sentiment doesn't change)
3. **Use tiered processing** - Don't skip material event filtering
4. **Monitor fallback rate** - High rate indicates service issues
5. **Enable CloudWatch alarms** - Catch issues early
6. **Test before deploying** - Use `test_local.py` for DistilFinBERT service

## Migration from Bag-of-Words

The system maintains backward compatibility:

1. **Old cache items** - Still work, use bag-of-words sentiment
2. **New cache items** - Include distilFinBERTScore for material events
3. **Gradual migration** - TTL naturally expires old items
4. **No breaking changes** - All new fields are optional

## Future Improvements

1. **Model versioning** - Track which DistilFinBERT version analyzed each article
2. **A/B testing** - Compare DistilFinBERT vs bag-of-words accuracy
3. **Fine-tuning** - Train custom model on stock-specific news
4. **Batch optimization** - Process multiple articles in single Lambda call
5. **Regional deployment** - Deploy DistilFinBERT closer to backend

## References

- [DistilFinBERT Service README](../../distilfinbert-service/README.md)
- [DistilFinBERT Deployment Guide](../../distilfinbert-service/DEPLOYMENT.md)
- [Phase 3 Implementation Plan](../../../docs/plans/Phase-3.md)
- [ProsusAI/FinBERT Model](https://huggingface.co/ProsusAI/finbert)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
