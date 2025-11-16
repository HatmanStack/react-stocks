# React Stocks Backend

AWS Lambda backend proxying Tiingo (stock prices) and Polygon (news) APIs with DynamoDB caching.

**Stack**: Node.js 20 | TypeScript 5 | Lambda + API Gateway + DynamoDB | AWS SAM

## Quick Start

```bash
# Prerequisites
npm run validate  # Checks AWS CLI, SAM CLI, credentials

# Deploy
cd backend
npm install
npm run deploy:guided  # First time - prompts for API keys
npm run deploy         # Subsequent deploys

# Note API Gateway URL from outputs - auto-updates ../env
```

## API Endpoints

### GET /stocks
**Params**: `ticker`, `startDate`, `endDate`, `type` (prices|metadata)
**Cache**: 7 days, >80% hit rate required
**Example**: `/stocks?ticker=AAPL&startDate=2025-01-01&type=prices`

### GET /news
**Params**: `ticker`, `from`, `to`
**Cache**: 30 days, deduped by URL hash
**Example**: `/news?ticker=AAPL&from=2025-01-01&to=2025-01-30`

### POST /sentiment
**Body**: `{"ticker":"AAPL","startDate":"2025-01-01","endDate":"2025-01-15"}`
**Returns**: `jobId` for async processing
**Cache**: 90 days

### GET /sentiment/job/{jobId}
**Returns**: Job status (PENDING | IN_PROGRESS | COMPLETED | FAILED)

### GET /sentiment
**Params**: `ticker`, `startDate`, `endDate`
**Returns**: Cached sentiment results

## DynamoDB Tables

| Table | TTL | Purpose |
|-------|-----|---------|
| StocksCache | 7d | Price data (OHLCV) |
| NewsCache | 30d | Articles (deduped) |
| SentimentCache | 90d | Sentiment scores |
| SentimentJobs | 24h | Job tracking |

**Billing**: Pay-per-request (auto-scales)
**Cost**: ~$9-12/month for 100 users (see Cost Optimization)

## Development

```bash
# Build & Test
npm run build
npm test
npm run test:coverage  # Target: >80%

# Local API
sam build
sam local start-api
curl "http://localhost:3000/stocks?ticker=AAPL&startDate=2024-01-01&type=metadata"

# Integration Tests (requires deployed backend)
export API_GATEWAY_URL="https://your-url.execute-api.us-east-1.amazonaws.com"
npm run test:integration
```

## Deployment

### First Time
```bash
sam build
sam deploy --guided
# Enter: Stack name, region, API keys
# Save config: Y
# Output: ReactStocksApiUrl (auto-updates frontend .env)
```

### Subsequent
```bash
npm run deploy  # Builds, deploys, updates .env
```

### Update Frontend Manually
```bash
npm run update-env [stack-name]
```

## Post-Deployment

```bash
# Verify
curl "https://your-api.execute-api.us-east-1.amazonaws.com/stocks?ticker=AAPL&startDate=2025-01-01&type=prices"

# Warm cache (reduces cold starts)
npm run warm-cache

# Create CloudWatch dashboard
npm run create-dashboard

# View logs
npm run logs
```

## Cost Optimization

**Target**: <$20/month for 100 users ✅

**Projected**: $9-12/month
- DynamoDB: ~$0.30/day (80% cache hit rate)
- Lambda: Minimal (free tier covers most)
- Storage: ~80MB (well under 25GB free tier)

**Monitor**:
```bash
# View costs
aws ce get-cost-and-usage \
  --time-period Start=$(date -d '30 days ago' +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --filter '{"Dimensions":{"Key":"SERVICE","Values":["Amazon DynamoDB"]}}'

# Set billing alarm
aws cloudwatch put-metric-alarm \
  --alarm-name DynamoDBCostAlert \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 86400 \
  --threshold 25 \
  --comparison-operator GreaterThanThreshold
```

**If costs exceed $20/month**:
1. Check cache hit rate (CloudWatch dashboard)
2. Run `npm run warm-cache`
3. Verify TTL working: `aws dynamodb describe-table --table-name react-stocks-StocksCache`

## Production Checklist

**Pre-Deploy**:
- [ ] Tests pass: `npm test`
- [ ] TypeScript clean: `npm run type-check`
- [ ] AWS credentials valid: `aws sts get-caller-identity`
- [ ] API keys ready

**Deploy**:
- [ ] `sam build && sam deploy`
- [ ] Note API Gateway URL
- [ ] Run `npm run warm-cache`
- [ ] Create dashboard: `npm run create-dashboard`

**Verify**:
- [ ] Test /stocks endpoint
- [ ] Test /news endpoint
- [ ] Test /sentiment POST → GET flow
- [ ] Cache hit rate >70% (CloudWatch)
- [ ] No Lambda errors (CloudWatch Logs)
- [ ] Frontend .env updated with EXPO_PUBLIC_BACKEND_URL

**Monitor** (First 24h):
- [ ] Lambda errors = 0
- [ ] API Gateway 5XX = 0
- [ ] DynamoDB throttling = 0
- [ ] Cache hit rate >70%

## Troubleshooting

**Lambda cold starts >1s**: Already at 1024MB memory, consider provisioned concurrency
**Cache hit rate <50%**: Run `npm run warm-cache`, check TTL settings
**DynamoDB throttling**: Using pay-per-request (auto-scales), check for hot partitions
**High costs**: Verify cache hit rate >70%, review TTL settings, check for duplicate writes

## Rollback

**Feature flag** (fastest):
```bash
# Frontend .env
EXPO_PUBLIC_USE_LAMBDA_SENTIMENT=false
```

**Full backend**:
```bash
sam deploy --guided  # Deploy previous version
```

## Scripts Reference

| Command | Description |
|---------|-------------|
| `npm run deploy` | Build + deploy + update frontend .env |
| `npm run deploy:guided` | Guided deployment (first time) |
| `npm run validate` | Check AWS prerequisites |
| `npm run warm-cache` | Pre-populate cache |
| `npm run create-dashboard` | CloudWatch dashboard |
| `npm run logs` | View Lambda logs |
| `npm run update-env [stack]` | Update frontend .env |
| `npm test` | Run tests |
| `npm run test:integration` | Integration tests (requires deployed backend) |

## Environment Variables

Set via SAM parameters during `deploy --guided`:
- `TIINGO_API_KEY` - Stock prices
- `FINNHUB_API_KEY` - News (deprecated, use Polygon)
- `POLYGON_API_KEY` - News articles

DynamoDB tables auto-configured by SAM.

## Security

- API keys encrypted in Lambda environment
- CORS enabled for frontend
- Input validation on all routes
- IAM: CloudWatch Logs + DynamoDB (scoped to tables)
- TTL auto-deletes stale data
