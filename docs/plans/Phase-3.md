# Phase 3: DistilFinBERT Integration

## Phase Goal

Deploy DistilFinBERT as an external Python service and integrate it with the Node.js Lambda backend to provide sophisticated contextual sentiment analysis for material events. The service provides the third and most accurate signal in the multi-signal architecture, running only on high-impact articles to balance accuracy with performance.

**Success Criteria:**
- DistilFinBERT service deployed and accessible via HTTP API
- Sentiment scores cached in DynamoDB to minimize API calls
- Integration with material event filtering (only EARNINGS, M&A, GUIDANCE, ANALYST_RATING)
- <200ms average response time (including caching)
- 90%+ cache hit rate after warmup period
- Graceful fallback to bag-of-words on service failures

**Estimated Tokens:** ~90,000

---

## Prerequisites

- Phases 0, 1, 2 completed
- Python 3.9+ installed
- AWS Lambda Python runtime or ECS Fargate access
- Understanding of transformer models (basic)
- Familiarity with FastAPI framework

---

## Tasks

### Task 0: Verify Prerequisites and Environment Setup

**Goal:** Verify all required tools and access are in place before beginning DistilFinBERT service development.

**Prerequisites:**
- Phases 0, 1, 2 completed
- Development machine ready

**Implementation Steps:**

1. **Verify Python Installation**
   - Run: `python --version` or `python3 --version`
   - Required: Python 3.9 or higher
   - If missing: Install from https://python.org or use `pyenv`

2. **Verify Docker Installation**
   - Run: `docker --version`
   - Required: Docker 20.0+
   - If missing: Install Docker Desktop (Mac/Windows) or Docker Engine (Linux)

3. **Verify AWS CLI Installation**
   - Run: `aws --version`
   - Required: AWS CLI v2
   - If missing: Install from https://aws.amazon.com/cli/

4. **Verify AWS Credentials**
   - Run: `aws sts get-caller-identity`
   - Should return your AWS account ID
   - If fails: Run `aws configure` and enter access key/secret

5. **Verify SAM CLI Installation**
   - Run: `sam --version`
   - Required: SAM CLI 1.90+
   - If missing: Install from https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html

6. **Verify AWS Permissions**
   - Required IAM permissions:
     - `lambda:CreateFunction`, `lambda:UpdateFunctionCode`
     - `ecr:CreateRepository`, `ecr:PutImage`
     - `apigateway:CreateRestApi`, `apigateway:PUT*`
     - `iam:CreateRole`, `iam:AttachRolePolicy`
     - `cloudformation:CreateStack`, `cloudformation:UpdateStack`
   - Test with: `aws iam get-user` (should not error)

7. **Create Python Virtual Environment**
   - Run: `python -m venv venv`
   - Activate: `source venv/bin/activate` (Mac/Linux) or `venv\Scripts\activate` (Windows)
   - Upgrade pip: `pip install --upgrade pip`

8. **Test PyTorch Installation**
   - Run: `pip install torch transformers`
   - Test: `python -c "import torch; print(torch.__version__)"`
   - Should print version without errors

9. **Check Disk Space**
   - DistilFinBERT model: ~250MB
   - Docker images: ~2-3GB
   - Required: At least 5GB free space

10. **Document Environment Info**
    - Note Python version, AWS region, account ID
    - Save for reference during deployment

**Verification Checklist:**
- [ ] Python 3.9+ installed
- [ ] Docker running
- [ ] AWS CLI configured
- [ ] SAM CLI installed
- [ ] AWS credentials valid
- [ ] IAM permissions sufficient
- [ ] Virtual environment created
- [ ] PyTorch importable
- [ ] Sufficient disk space
- [ ] Environment info documented

**Estimated Tokens:** ~6,000

---

### Task 1: Create DistilFinBERT Python Service

**Goal:** Build standalone FastAPI service that runs DistilFinBERT model inference and exposes HTTP API.

**Files to Create:**
- `distilfinbert-service/app.py` - FastAPI application
- `distilfinbert-service/model.py` - Model loading and inference logic
- `distilfinbert-service/requirements.txt` - Python dependencies
- `distilfinbert-service/Dockerfile` - Container definition

**Implementation Steps:**

1. **Create Project Structure**
   - Create directory: `distilfinbert-service/`
   - Subdirectories: `app/` (application code), `models/` (model cache), `tests/`
   - Initialize git if separate repo, or add to monorepo under `backend/`

2. **Define Python Dependencies**
   - Create `requirements.txt` with:
     - `transformers>=4.30.0` (Hugging Face library)
     - `torch>=2.0.0` (PyTorch backend)
     - `fastapi>=0.100.0` (web framework)
     - `mangum>=0.17.0` (Lambda adapter for FastAPI)
     - `pydantic>=2.0.0` (data validation)
     - `uvicorn[standard]>=0.23.0` (ASGI server for local dev)
   - Pin versions for reproducibility

3. **Create Model Loading Module** (`model.py`)
   - Define `load_model()` function that:
     - Loads tokenizer: `AutoTokenizer.from_pretrained('ProsusAI/finbert')`
     - Loads model: `AutoModelForSequenceClassification.from_pretrained('ProsusAI/finbert')`
     - Sets model to eval mode: `model.eval()`
     - Disables gradients: `torch.no_grad()`
     - Caches model in global variable for Lambda reuse
   - Handle model download on first run (caches to `/tmp` in Lambda)
   - Add error handling for model loading failures

4. **Create Inference Function** (`model.py`)
   - Define `analyze_sentiment(text: str) -> dict`:
     - Tokenize input text (max length 512 tokens)
     - Run model inference
     - Extract logits from output
     - Apply softmax to get probabilities: [negative, neutral, positive]
     - Map to continuous score: `score = positive_prob - negative_prob` (range -1 to +1)
     - Calculate confidence: `max(probabilities)` (range 0 to 1)
     - Return: `{sentiment: float, confidence: float, label: str}`
   - Handle edge cases: empty text, very long text (truncate)

5. **Create FastAPI Application** (`app.py`)
   - Initialize FastAPI app
   - Define request model: `class SentimentRequest(BaseModel): text: str`
   - Define response model: `class SentimentResponse(BaseModel): sentiment: float; confidence: float; label: str`
   - Create POST endpoint `/sentiment`:
     - Accepts `SentimentRequest`
     - Validates text not empty
     - Calls `analyze_sentiment(text)`
     - Returns `SentimentResponse`
   - Create GET endpoint `/health`:
     - Returns `{status: "healthy", model_loaded: bool}`
     - Check if model is loaded successfully
   - Add error handling middleware (return 500 on exceptions)
   - Add logging for all requests

6. **Add Batch Processing Support** (optional but recommended)
   - Create POST endpoint `/sentiment/batch`:
     - Accepts `{texts: List[str]}`
     - Process up to 10 texts in parallel
     - Return `List[SentimentResponse]`
   - Implement with `asyncio.gather` for concurrency

7. **Create Lambda Handler** (`handler.py`)
   - Import Mangum adapter: `from mangum import Mangum`
   - Wrap FastAPI app: `handler = Mangum(app)`
   - This converts API Gateway events to FastAPI requests
   - Add environment variable support (model name, cache dir)

8. **Create Dockerfile for Local Testing**
   - Base image: `python:3.9-slim`
   - Install dependencies from `requirements.txt`
   - Copy application code
   - Expose port 8000
   - CMD: `uvicorn app:app --host 0.0.0.0 --port 8000`
   - Build command: `docker build -t distilfinbert-service .`
   - Run command: `docker run -p 8000:8000 distilfinbert-service`

9. **Add Local Testing Script**
   - Create `test_local.py`:
     - Test sentiment endpoint with sample texts
     - Verify scores in expected range
     - Check response format
     - Measure inference time
   - Run with: `python test_local.py`

10. **Create README with Usage Examples**
    - Installation instructions
    - Local development setup
    - API endpoint documentation
    - Example requests/responses
    - Performance characteristics

**Verification:**
- Service starts successfully
- Model loads without errors
- API responds to requests
- Sentiment scores in -1 to +1 range
- Health check returns 200

**Testing:**
- Create test client script
- Test with sample financial texts
- Verify scores make sense (positive news → positive score)
- Load test with 100 concurrent requests

**Estimated Tokens:** ~18,000

---

### Task 2: Deploy DistilFinBERT Service to AWS Lambda

**Goal:** Deploy the Python service to AWS Lambda with API Gateway HTTP API per ADR-006.

**Files to Create:**
- `distilfinbert-service/template.yaml` - SAM template for Lambda deployment
- `distilfinbert-service/.dockerignore` - Exclude unnecessary files from image
- `distilfinbert-service/deploy.sh` - Deployment script

**Prerequisites:**
- Task 1 completed (service runs locally)
- AWS CLI configured with appropriate credentials
- SAM CLI installed (`sam --version`)
- Docker installed (for container image build)

**Implementation Steps:**

1. **Create SAM Template** (`template.yaml`)
   - Define Lambda function resource with:
     - `PackageType: Image` (container image deployment)
     - `ImageUri: !Sub ${AWS::AccountId}.dkr.ecr.${AWS::Region}.amazonaws.com/distilfinbert:latest`
     - `MemorySize: 2048` (model needs RAM)
     - `Timeout: 30` (inference can take 5-10s)
     - `Architectures: [x86_64]`
     - `EphemeralStorage: Size: 1024` (model files)
   - Define API Gateway HTTP API resource
   - Define Lambda permission for API Gateway invocation
   - Configure CORS: `AllowOrigins: ['*']` (or specific frontend domain)
   - Add CloudWatch Logs role and permissions

2. **Configure Environment Variables**
   - `MODEL_NAME`: `ProsusAI/finbert`
   - `MODEL_CACHE_DIR`: `/tmp/models`
   - `LOG_LEVEL`: `INFO`

3. **Update Dockerfile for Lambda**
   - Change base image to: `public.ecr.aws/lambda/python:3.9`
   - Copy app code to `${LAMBDA_TASK_ROOT}`
   - Copy handler to `${LAMBDA_TASK_ROOT}/handler.py`
   - Set CMD: `["handler.handler"]` (Lambda entry point)
   - Pre-download model during build (optional, faster cold starts)

4. **Create Deployment Script** (`deploy.sh`)
   - Build Docker image: `docker build -t distilfinbert .`
   - Authenticate to ECR: `aws ecr get-login-password`
   - Create ECR repository if not exists: `aws ecr create-repository --repository-name distilfinbert`
   - Tag image: `docker tag distilfinbert:latest <account>.dkr.ecr.<region>.amazonaws.com/distilfinbert:latest`
   - Push image: `docker push <account>.dkr.ecr.<region>.amazonaws.com/distilfinbert:latest`
   - Deploy with SAM: `sam deploy --guided` (first time) or `sam deploy` (subsequent)

5. **Run Initial Deployment**
   - Execute: `./deploy.sh`
   - SAM will prompt for:
     - Stack name: `distilfinbert-service`
     - AWS region: `us-east-1` (or your preferred region)
     - Confirm changes: `y`
     - Save config: `y`
   - Wait for deployment (5-10 minutes)
   - Note the API Gateway URL from outputs

6. **Configure API Gateway Throttling**
   - Set burst limit: 50 requests/second
   - Set rate limit: 20 requests/second
   - Prevents DDoS and cost overruns

7. **Set Up CloudWatch Alarms**
   - Lambda errors alarm: trigger if error rate >5%
   - Lambda duration alarm: trigger if avg duration >10s
   - Lambda throttles alarm: trigger if any throttling occurs
   - Send alerts to SNS topic (email notification)

8. **Test Deployed Service**
   - Get API Gateway URL from CloudFormation outputs
   - Test health endpoint: `curl https://<api-url>/health`
   - Test sentiment endpoint: `curl -X POST https://<api-url>/sentiment -d '{"text":"Earnings beat expectations"}'`
   - Verify response format and score range

9. **Update Backend Environment Variable**
   - Add to backend Lambda environment: `DISTILFINBERT_API_URL=https://<api-url>`
   - Or store in AWS Systems Manager Parameter Store for centralized config

10. **Document API URL**
    - Add to project README
    - Store in secure location (parameter store)
    - Share with team

**Verification:**
- Service accessible via public URL
- API Gateway throttling configured
- CloudWatch logs working
- Cold start time acceptable (<10s)
- Warm responses <500ms

**Estimated Tokens:** ~15,000

---

### Task 3: Create DistilFinBERT Client Service (Backend)

**Goal:** Build Node.js client in Lambda backend to call DistilFinBERT service with retry logic and error handling.

**Files to Create:**
- `backend/src/services/distilFinBERT.service.ts` - Client service
- `backend/src/services/__tests__/distilFinBERT.service.test.ts` - Tests

**Implementation Guidance:**
- Use axios for HTTP requests
- Set timeout to 5000ms
- Implement exponential backoff retry (3 attempts)
- Handle network errors, timeouts, service errors
- Parse response and extract sentiment score
- Validate score is number in -1 to +1 range
- Log request/response for debugging
- Return null on failures (triggers fallback)

**Example Interface:**
```typescript
export async function getDistilFinBERTSentiment(
  text: string
): Promise<number | null> {
  // Returns sentiment score -1 to +1, or null on error
}
```

**Verification:**
- Client successfully calls service
- Retry logic works on failures
- Timeout handling prevents hanging
- Error responses logged properly
- Null returned on all error types

**Testing:**
- Mock HTTP client for unit tests
- Test successful response parsing
- Test timeout scenario
- Test network error
- Test invalid response format
- Integration test with real service

**Estimated Tokens:** ~12,000

---

### Task 4: Implement Tiered Processing Logic

**Goal:** Integrate DistilFinBERT into sentiment pipeline with smart filtering based on event type and caching.

**Files to Modify:**
- `backend/src/services/sentimentProcessing.service.ts` - Add DistilFinBERT step

**Implementation Guidance:**
- After event classification and aspect analysis, check if material event
- Material events: EARNINGS, M&A, GUIDANCE, ANALYST_RATING
- Non-material: PRODUCT_LAUNCH, GENERAL → skip DistilFinBERT
- For material events:
  1. Check cache first (DynamoDB sentiment cache)
  2. If cached, use cached score
  3. If not cached, call DistilFinBERT service
  4. Cache result for future use
  5. On service error, fallback to bag-of-words score

**Processing Flow:**
```typescript
const isMaterialEvent = ['EARNINGS', 'M&A', 'GUIDANCE', 'ANALYST_RATING']
  .includes(eventType);

let finBERTScore = null;

if (isMaterialEvent) {
  // Check cache
  const cached = await getCachedSentiment(articleHash);
  if (cached?.distilFinBERTScore) {
    finBERTScore = cached.distilFinBERTScore;
  } else {
    // Call service
    finBERTScore = await getDistilFinBERTSentiment(articleText);

    if (finBERTScore !== null) {
      // Cache result
      await cacheSentiment({
        articleHash,
        distilFinBERTScore: finBERTScore,
        ttl: 30 days
      });
    } else {
      // Fallback to bag-of-words
      finBERTScore = bagOfWordsScore;
    }
  }
}
```

**Verification:**
- Material events get DistilFinBERT scores
- Non-material events skip DistilFinBERT (performance optimization)
- Caching reduces API calls (verify cache hit metrics)
- Fallback works on service failures
- Processing time acceptable (<200ms with cache, <2s without)

**Testing:**
- Test material event → DistilFinBERT called
- Test non-material event → DistilFinBERT skipped
- Test cache hit → service not called
- Test cache miss → service called, result cached
- Test service failure → fallback to bag-of-words

**Estimated Tokens:** ~15,000

---

### Task 5: Add DistilFinBERT to Sentiment Cache Schema

**Goal:** Extend DynamoDB cache to store DistilFinBERT scores alongside other sentiment data.

**Files to Modify:**
- `backend/src/repositories/sentimentCache.repository.ts` - Add distilFinBERTScore field

**Implementation Guidance:**
- Add optional field `distilFinBERTScore?: number` to `SentimentCacheItem`
- Update put/get methods to handle new field
- Maintain backward compatibility (existing items don't have this field)
- Add index for querying by score (optional, for analytics)

**Schema Update:**
```typescript
export interface SentimentCacheItem {
  // Existing fields
  ticker: string;
  articleHash: string;
  sentiment: SentimentData;
  analyzedAt: number;
  ttl: number;

  // Phase 1 addition
  eventType?: EventType;

  // Phase 2 addition
  aspectScore?: number;
  aspectBreakdown?: AspectBreakdown;

  // Phase 3 addition - NEW
  distilFinBERTScore?: number;  // -1 to +1, only present for material events
  modelVersion?: string;        // Track DistilFinBERT model version
}
```

**Verification:**
- New items include distilFinBERTScore when present
- Old items without field still readable
- TTL still works correctly
- No schema migration needed (optional field)

**Testing:**
- Write item with distilFinBERTScore
- Read item, verify score present
- Read old item without score, verify doesn't error
- Verify TTL expiration works

**Estimated Tokens:** ~8,000

---

### Task 6: Implement Performance Monitoring

**Goal:** Track DistilFinBERT service performance, cache hit rates, and fallback frequency for optimization.

**Files to Modify:**
- `backend/src/utils/metrics.util.ts` - Add DistilFinBERT metrics

**Metrics to Track:**
- API call count
- Cache hit rate
- Average response time
- Error rate
- Fallback rate (when bag-of-words used instead)
- Material vs non-material event ratio

**Implementation Guidance:**
- Log metrics every N articles processed
- Export to CloudWatch custom metrics (optional)
- Track in-memory counters for batch aggregation
- Reset counters periodically

**Example Metrics:**
```typescript
{
  distilFinBERT: {
    totalCalls: 150,
    cacheHits: 120,
    cacheMisses: 30,
    cacheHitRate: 0.80,
    avgResponseTime: 450ms,
    errors: 2,
    errorRate: 0.013,
    fallbacks: 2
  }
}
```

**Verification:**
- Metrics logged correctly
- Cache hit rate increases over time
- Performance metrics accurate
- No performance impact from tracking (<1ms overhead)

**Estimated Tokens:** ~8,000

---

### Task 7: Create DistilFinBERT Documentation

**Goal:** Document the DistilFinBERT integration, deployment, and troubleshooting.

**Files to Create:**
- `distilfinbert-service/README.md` - Service documentation
- `backend/docs/distilfinbert-integration.md` - Integration guide

**Content:**
- Model details (which DistilFinBERT variant, why chosen)
- Deployment instructions (Lambda vs ECS)
- API documentation (endpoints, request/response format)
- Performance characteristics (latency, throughput)
- Caching strategy
- Fallback behavior
- Troubleshooting common issues
- Cost estimation

**Estimated Tokens:** ~6,000

---

## Phase Verification

### Integration Test:
```typescript
it('should use DistilFinBERT for earnings article', async () => {
  const article = {
    ticker: 'AAPL',
    headline: 'Apple Crushes Earnings Expectations',
    summary: 'Apple reported outstanding Q1 results...'
  };

  const eventType = await classifyEvent(article);
  const result = await processSentimentForTicker(...);

  expect(result.distilFinBERTScore).toBeDefined();
  expect(result.distilFinBERTScore).toBeGreaterThan(0.5); // Should be positive
});
```

### Performance Benchmarks:
- Cache hit: <50ms
- Cache miss (cold): <2s
- Cache miss (warm): <500ms
- Cache hit rate after 1000 articles: >80%

---

## Next Steps

Proceed to:
- [Phase 4: Data Schema & Storage Updates](./Phase-4.md)
