# Phase 0: Foundation - Architecture & Deployment Strategy

## Purpose

This document establishes the architectural foundation, design decisions, and shared patterns that apply to **all phases** of the API Gateway optimization project. Engineers implementing Phase 1 and Phase 2 must read and understand this document first.

**Think of Phase-0 as "The Law"** - it defines:
- Architecture Decision Records (ADRs) explaining "why"
- Deployment script specifications for consistent infrastructure updates
- Testing strategies ensuring CI compatibility
- Shared patterns and conventions to maintain consistency

---

## Architecture Decision Records (ADRs)

### ADR-001: API Gateway Response Caching Strategy

**Context:**
Currently, every API request invokes Lambda, even for identical requests. API Gateway v2 HTTP API supports response caching which can reduce Lambda invocations by 40-60% for stable data (stock prices, company metadata).

**Decision:**
Enable API Gateway caching with TTL based on data volatility:
- **Stock prices** (historical): 5 minutes (data doesn't change)
- **Company metadata**: 1 hour (rarely changes)
- **News articles**: 2 minutes (updates frequently during market hours)
- **Sentiment results** (GET /sentiment): 5 minutes (computed results are stable)
- **Search queries**: 5 minutes (ticker lists don't change often)

**Rationale:**
- Historical stock prices are immutable - once a trading day closes, OHLCV data never changes
- Company metadata (name, description, exchange) rarely updates
- News articles update frequently but not in real-time
- Cache keys include query parameters (ticker, startDate, endDate) for granular caching
- Reduces Lambda invocations, DynamoDB reads, and API calls to Tiingo/Finnhub

**Trade-offs:**
- Additional cost: API Gateway caching costs ~$0.02/GB/hour per cache size
- Stale data risk: Mitigated by short TTLs and cache invalidation patterns
- Complexity: Cache key design must account for query parameter variations

**Implementation Notes:**
- Use `CacheKeyParameters` to include query string parameters in cache key
- Set `CacheDataEncrypted: true` for security
- Start with 0.5GB cache size, monitor hit rate and adjust
- Cache warming for popular tickers during pre-market hours

---

### ADR-002: Lambda Memory and Timeout Tuning

**Context:**
All endpoints currently use 1024MB memory and 60s timeout. Different endpoints have vastly different resource requirements:
- `/stocks` - Simple DynamoDB lookup + API proxy
- `/sentiment` - CPU-intensive sentiment analysis
- `/predict` - TensorFlow.js model training and inference

**Decision:**
Implement per-endpoint Lambda configuration:
- **GET /stocks**: 512MB, 30s timeout (I/O bound)
- **GET /news**: 512MB, 30s timeout (I/O bound)
- **GET /search**: 256MB, 10s timeout (lightweight)
- **POST /sentiment**: 1536MB, 120s timeout (CPU intensive)
- **GET /sentiment/job/{jobId}**: 256MB, 10s timeout (DynamoDB lookup)
- **POST /predict**: 2048MB, 120s timeout (ML training/inference)

**Rationale:**
- Lambda pricing is proportional to GB-seconds (memory × duration)
- Over-provisioning wastes money; under-provisioning causes timeouts
- AWS Lambda allocates CPU proportionally to memory (more memory = faster execution for CPU-bound tasks)
- Sentiment and prediction endpoints benefit from higher memory (faster TensorFlow.js)

**Trade-offs:**
- Complexity: Requires separate Lambda functions or environment variables per endpoint
- Cold starts: Higher memory configurations have slightly longer cold start times
- Cost: ML endpoints cost more but complete faster, reducing overall GB-seconds

**Implementation Notes:**
- Use SAM template `Environment` overrides per function event
- Monitor CloudWatch metrics: Duration, Memory Used, Throttles
- Adjust based on actual usage patterns after 1-2 weeks

---

### ADR-003: DynamoDB TTL Optimization by Data Type

**Context:**
All DynamoDB cache items currently use 7-day TTL regardless of data type. This is wasteful for volatile data (news) and insufficient for stable data (historical prices).

**Decision:**
Implement variable TTL based on data volatility:
- **Stock prices** (historical closed days): 90 days (immutable once day closes)
- **Stock prices** (today/recent): 1 day (intraday updates)
- **Company metadata**: 30 days (rarely changes)
- **News articles**: 7 days (moderate volatility)
- **Sentiment cache**: 30 days (computed results are expensive to regenerate)
- **Sentiment jobs**: 1 day (temporary job status)

**Rationale:**
- Historical prices are immutable - longer TTL reduces Tiingo API calls
- Current-day prices may need intraday updates
- Sentiment analysis is expensive (FinBERT inference) - cache longer
- Job status only needed during polling window (~5-15 minutes)

**Trade-offs:**
- Storage costs increase with longer TTL
- Stale data risk for current-day prices
- Complexity: Logic to determine if date is "historical" vs "current"

**Implementation Notes:**
- Add utility function `calculateTTLByDataType(type, date)` in `cache.util.ts`
- Update repository `putStock`, `putNews`, `putSentiment` methods
- Consider date comparison: `if (date < today) { ttl = 90 days } else { ttl = 1 day }`

---

### ADR-004: Response Compression (gzip)

**Context:**
Stock price responses can be large (30 days = 30 records × 200 bytes = 6KB+). API Gateway supports automatic gzip compression but it's not enabled.

**Decision:**
Enable response compression for all endpoints with minimum compression size of 1KB.

**Rationale:**
- Reduces data transfer costs (AWS charges for data OUT)
- Improves frontend latency, especially on mobile networks
- No cost to enable (included in API Gateway pricing)
- Modern browsers automatically handle gzip decompression

**Trade-offs:**
- Minimal CPU overhead for compression
- Not effective for small responses (<1KB)
- Already-compressed responses (images) won't benefit

**Implementation Notes:**
- Add `MinimumCompressionSize: 1024` to API Gateway configuration
- Frontend axios client automatically handles `Accept-Encoding: gzip`
- Monitor CloudWatch metrics for data transfer reduction

---

### ADR-005: Provisioned Concurrency for Market Hours

**Context:**
Cold starts during market hours (9:30 AM - 4:00 PM ET) cause 1-3 second delays, degrading user experience. Traffic is predictable during these hours.

**Decision:**
Implement provisioned concurrency with schedule-based scaling:
- **Pre-market** (9:00-9:30 AM ET): 2 provisioned instances
- **Market hours** (9:30 AM - 4:00 PM ET): 5 provisioned instances
- **After-hours** (4:00 PM - 9:00 AM ET): 0 provisioned (on-demand only)

**Rationale:**
- Eliminates cold starts during peak traffic hours
- Predictable traffic pattern aligns with market schedule
- Provisioned concurrency costs ~$0.015/GB-hour but prevents poor UX
- Zero provisioned instances during off-hours minimizes waste

**Trade-offs:**
- Additional cost: ~$5-10/day during market hours
- Over-provisioning wastes money; under-provisioning still has cold starts
- Requires EventBridge rules to manage schedule

**Implementation Notes:**
- Use Application Auto Scaling with target tracking
- Create EventBridge rules for schedule-based scaling
- Start conservative (2/5 instances), monitor and adjust
- Consider weekends/holidays (markets closed) - reduce to 0

---

### ADR-006: Request Batching API Design

**Context:**
Frontend often fetches data for multiple tickers simultaneously (portfolio with 5-10 stocks). Each ticker makes 3 separate API calls (stocks, news, sentiment), resulting in 30+ serial round-trips.

**Decision:**
Create batch endpoints that accept multiple tickers:
- `POST /batch/stocks` - Body: `{ tickers: ['AAPL', 'GOOGL'], startDate, endDate }`
- `POST /batch/news` - Body: `{ tickers: ['AAPL', 'GOOGL'], limit }`
- `POST /batch/sentiment` - Body: `{ tickers: ['AAPL', 'GOOGL'], startDate, endDate }`

Return format: `{ data: { AAPL: [...], GOOGL: [...] } }`

**Rationale:**
- Reduces round-trip latency (1 request vs 10 requests)
- Parallel processing within Lambda (Promise.all)
- Lower API Gateway costs (fewer requests)
- Better mobile network performance

**Trade-offs:**
- Larger request/response payloads
- Timeout risk if too many tickers requested
- Need rate limiting per batch size
- Frontend changes required

**Implementation Notes:**
- Limit batch size to 10 tickers to prevent timeouts
- Process tickers in parallel using `Promise.allSettled` (don't fail entire batch on one error)
- Return partial results: `{ data: { AAPL: [...] }, errors: { GOOGL: 'Not found' } }`
- Maintain backward compatibility - keep single-ticker endpoints

---

### ADR-007: Cache Warming Strategy

**Context:**
First request of the day for popular tickers (AAPL, TSLA, MSFT) is slow due to empty cache. Predictable pre-market warming can improve morning experience.

**Decision:**
Implement EventBridge-triggered Lambda function that pre-warms cache:
- **Schedule**: Daily at 9:00 AM ET (30 minutes before market open)
- **Tickers**: Top 20 most-requested tickers (tracked via CloudWatch metrics)
- **Data**: Stock prices (last 30 days), news (last 7 days), metadata
- **Storage**: DynamoDB cache (standard flow)

**Rationale:**
- First-request latency eliminated for 80% of users (Pareto principle)
- Leverages existing cache infrastructure
- EventBridge + Lambda is cost-effective (~$0.10/day)
- Tracks actual usage patterns (top tickers) rather than hardcoding

**Trade-offs:**
- Wastes cache space for tickers that won't be requested
- API costs for Tiingo/Finnhub during warming
- Requires tracking mechanism for "top tickers"

**Implementation Notes:**
- Create CloudWatch Logs Insights query to extract top tickers from last 7 days
- Store top tickers in DynamoDB or Parameter Store
- Use batch processing to warm multiple tickers efficiently
- Monitor warming duration (<5 minutes acceptable)

---

## Deployment Script Specifications

### Overview

The `npm run deploy` command in `/backend` must handle the complete deployment lifecycle:
1. Check for required inputs (API keys, region, stack name)
2. Prompt user for missing values
3. Save inputs to `.deploy-config.json` (git-ignored) for future runs
4. Generate `samconfig.toml` programmatically (never use `sam deploy --guided`)
5. Execute `sam build && sam deploy`
6. Capture CloudFormation outputs
7. Update frontend `.env` file with API Gateway URL

### Script Architecture

**File**: `/backend/scripts/deploy.js`

**Responsibilities**:
1. **Prerequisite checking** - Verify AWS CLI, SAM CLI, credentials
2. **Config management** - Load/save `.deploy-config.json`
3. **Interactive prompts** - Collect missing values
4. **SAM config generation** - Build `samconfig.toml` from config
5. **Deployment execution** - Run SAM commands, capture output
6. **Environment injection** - Update frontend `.env` with stack outputs

### Configuration File Format

**`.deploy-config.json`** (git-ignored, local only):
```json
{
  "region": "us-east-1",
  "stackName": "react-stocks-backend",
  "tiingoApiKey": "****",
  "finnhubApiKey": "****",
  "allowedOrigins": "*",
  "lambdaMemory": {
    "stocks": "512",
    "news": "512",
    "search": "256",
    "sentiment": "1536",
    "predict": "2048"
  },
  "lambdaTimeout": {
    "stocks": "30",
    "news": "30",
    "search": "10",
    "sentiment": "120",
    "predict": "120"
  },
  "enableProvisionedConcurrency": false,
  "provisionedConcurrency": {
    "marketHours": 5,
    "preMarket": 2
  },
  "apiGatewayCacheSize": "0.5",
  "enableCaching": true
}
```

### Generated SAM Config Format

**`samconfig.toml`** (generated, not committed):
```toml
version = 0.1

[default.deploy.parameters]
stack_name = "react-stocks-backend"
region = "us-east-1"
capabilities = "CAPABILITY_IAM"
parameter_overrides = [
  "TiingoApiKey=****",
  "FinnhubApiKey=****",
  "AllowedOrigins=*",
  "EnableCaching=true",
  "CacheSize=0.5"
]
resolve_s3 = true
```

### Deployment Flow

```
START
  ↓
[1] Check prerequisites (AWS CLI, SAM CLI, credentials)
  ↓ OK
[2] Load .deploy-config.json (if exists)
  ↓
[3] Prompt for missing values (region, stack name, API keys)
  ↓
[4] Save config to .deploy-config.json
  ↓
[5] Generate samconfig.toml from config
  ↓
[6] Run: sam build
  ↓ Success
[7] Run: sam deploy --no-confirm-changeset
  ↓ Success
[8] Fetch CloudFormation stack outputs
  ↓
[9] Update frontend .env: EXPO_PUBLIC_BACKEND_URL={ApiGatewayUrl}
  ↓
[10] Display success message with API URL
  ↓
END
```

### Error Handling

- **AWS CLI not configured**: Display error, exit with code 1
- **SAM CLI not installed**: Display error with installation link, exit with code 1
- **Build fails**: Display SAM error output, exit with code 1
- **Deploy fails**: Display CloudFormation error, exit with code 1
- **Stack outputs not found**: Warn user, skip .env update (non-fatal)

### Security Considerations

- **Never commit** `.deploy-config.json` (add to `.gitignore`)
- **Never commit** `samconfig.toml` (add to `.gitignore`)
- **Never log** API keys to console (mask with `****`)
- **Environment variables** in Lambda are encrypted at rest by AWS

---

## Testing Strategy

### Overview

All tests must run successfully in CI environment (GitHub Actions) without live AWS resources. This requires comprehensive mocking of AWS services, external APIs, and asynchronous operations.

### Testing Pyramid

```
        /\
       /E2E\       <- Local only, not CI (optional)
      /------\
     /  INT   \    <- Mocked AWS SDK, no live resources
    /----------\
   /    UNIT    \  <- Pure functions, business logic
  /--------------\
```

**Unit Tests** (80% coverage target):
- Pure functions (cache.util.ts, response.util.ts, error.util.ts)
- Repository methods (mock DynamoDB client)
- Service methods (mock axios for API calls)
- Handler logic (mock repositories and services)

**Integration Tests** (Mocked, CI-compatible):
- Full Lambda handler execution (mock AWS SDK, axios)
- API Gateway event → Lambda handler → Response format
- Error scenarios (timeout, invalid input, API failures)
- Cache hit/miss logic with mocked DynamoDB

**E2E Tests** (Local verification only):
- Deploy to real AWS stack
- Frontend → API Gateway → Lambda → DynamoDB → External APIs
- Verify caching behavior, performance metrics
- NOT required for CI, developer-run only

### Mocking Patterns

**AWS SDK Mocking** (DynamoDB, Lambda, CloudWatch):
```typescript
// Use aws-sdk-client-mock library
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const dynamoMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  dynamoMock.reset();
});

test('should fetch from cache', async () => {
  dynamoMock.on(GetCommand).resolves({
    Item: { ticker: 'AAPL', date: '2025-01-15', ... }
  });

  const result = await getStock('AAPL', '2025-01-15');
  expect(result).toBeDefined();
});
```

**Axios Mocking** (External APIs):
```typescript
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

const mockAxios = new MockAdapter(axios);

beforeEach(() => {
  mockAxios.reset();
});

test('should fetch stock prices from Tiingo', async () => {
  mockAxios.onGet(/tiingo/).reply(200, { data: [...] });

  const result = await fetchStockPrices('AAPL', '2025-01-01');
  expect(result).toHaveLength(30);
});
```

**Lambda Handler Mocking** (API Gateway events):
```typescript
import { APIGatewayProxyEventV2 } from 'aws-lambda';

const mockEvent: APIGatewayProxyEventV2 = {
  rawPath: '/stocks',
  requestContext: {
    http: { method: 'GET' },
    requestId: 'test-123'
  },
  queryStringParameters: {
    ticker: 'AAPL',
    startDate: '2025-01-01'
  }
};

test('should return 200 with stock data', async () => {
  const response = await handler(mockEvent);
  expect(response.statusCode).toBe(200);
});
```

### CI Pipeline Configuration

**GitHub Actions** (`.github/workflows/backend-ci.yml`):
```yaml
name: Backend CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - name: Install dependencies
        run: cd backend && npm install
      - name: Run linter
        run: cd backend && npm run lint
      - name: Run unit tests
        run: cd backend && npm test
      - name: Run integration tests (mocked)
        run: cd backend && npm run test:integration
      - name: Check coverage
        run: cd backend && npm run test:coverage
```

**Key Requirements**:
- No AWS credentials in CI environment
- All tests use mocked AWS SDK clients
- No external API calls (mock axios)
- Fast execution (<5 minutes total)

---

## Shared Patterns and Conventions

### Error Handling Pattern

**Consistent error responses**:
```typescript
// utils/error.util.ts
export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'APIError';
  }
}

// Usage in handlers
if (!ticker) {
  throw new APIError('Missing required parameter: ticker', 400, 'MISSING_PARAMETER');
}
```

**Error logging**:
```typescript
import { logError } from '../utils/error.util';

try {
  // ... operation
} catch (error) {
  logError('HandlerName', error, { ticker, requestId });
  throw error; // Re-throw after logging
}
```

### Response Format Pattern

**Success responses**:
```typescript
return successResponse(
  data,
  200,
  {
    _meta: {
      cached: true,
      cacheHitRate: 0.85,
      timestamp: new Date().toISOString()
    }
  }
);
```

**Error responses**:
```typescript
return errorResponse('Ticker not found', 404);
```

### Metrics Logging Pattern

**CloudWatch custom metrics**:
```typescript
import { logMetrics, MetricUnit } from '../utils/metrics.util';

logMetrics(
  [
    { name: 'CacheHitRate', value: 85, unit: MetricUnit.Percent },
    { name: 'RequestDuration', value: 150, unit: MetricUnit.Milliseconds }
  ],
  { Endpoint: 'stocks', Ticker: 'AAPL', Cached: 'true' }
);
```

### Repository Pattern

**Consistent interface**:
```typescript
// repositories/[resource].repository.ts
export async function get[Resource](key: string): Promise<Item | null>
export async function put[Resource](item: Item): Promise<void>
export async function batchGet[Resource](keys: string[]): Promise<Item[]>
export async function batchPut[Resource](items: Item[]): Promise<void>
export async function query[Resource]ByRange(start, end): Promise<Item[]>
```

### Commit Message Format

**Conventional Commits**:
```
Author & Commiter: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com

type(scope): brief description

Detail 1
Detail 2
Detail 3
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `perf`: Performance improvement
- `refactor`: Code restructuring
- `test`: Test additions/modifications
- `docs`: Documentation changes
- `chore`: Build/tooling changes

**Scopes**:
- `api-gateway`: API Gateway configuration
- `lambda`: Lambda function changes
- `dynamodb`: DynamoDB schema/repository changes
- `deployment`: Deployment script changes
- `tests`: Test infrastructure

**Examples**:
```
feat(api-gateway): enable response caching with 5min TTL

Configure API Gateway cache for stocks and metadata endpoints
Add cache key parameters for query string inclusion
Set cache size to 0.5GB with encryption enabled
```

```
perf(lambda): optimize memory allocation per endpoint

Reduce stocks endpoint to 512MB (I/O bound)
Increase sentiment endpoint to 1536MB (CPU intensive)
Adjust timeouts to match endpoint requirements
```

---

## Verification Checklist

Before proceeding to Phase 1, ensure:

- [ ] All ADRs are understood (caching, Lambda tuning, TTL, compression, provisioning, batching, warming)
- [ ] Deployment script flow is clear (prompt → config → SAM → outputs → .env)
- [ ] Testing strategy is understood (mocked AWS SDK, no live resources in CI)
- [ ] Shared patterns are clear (error handling, responses, metrics, commits)
- [ ] `.gitignore` includes `.deploy-config.json` and `samconfig.toml`
- [ ] CI pipeline configuration is reviewed

---

**Next Steps:** Proceed to [Phase 1: Infrastructure Optimizations](./Phase-1.md)
