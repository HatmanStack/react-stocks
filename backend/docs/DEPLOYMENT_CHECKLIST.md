# Production Deployment Checklist

## Pre-Deployment Checklist

Run this checklist before deploying to production.

### 1. Code Quality

- [ ] All tests passing: `npm test` (both backend and frontend)
- [ ] TypeScript compilation clean: `npm run type-check`
- [ ] No linting errors: `npm run lint`
- [ ] Code reviewed and approved

### 2. Configuration

- [ ] Environment variables set in `.env` (frontend)
- [ ] `EXPO_PUBLIC_BACKEND_URL` points to production API Gateway
- [ ] `EXPO_PUBLIC_USE_LAMBDA_SENTIMENT=true` feature flag enabled
- [ ] AWS credentials configured: `aws sts get-caller-identity`
- [ ] Correct AWS region selected (default: us-east-1)

### 3. AWS Infrastructure

- [ ] SAM CLI installed: `sam --version` (≥1.100.0)
- [ ] DynamoDB tables exist (or will be created by SAM)
- [ ] Lambda IAM roles configured with correct permissions
- [ ] API keys for Tiingo and Finnhub ready (for SAM parameters)

### 4. Testing

- [ ] Integration tests pass: `npm run test:integration`
- [ ] Sentiment analysis tested on staging
- [ ] Cache warming tested locally: `npm run warm-cache`
- [ ] CloudWatch dashboard accessible

### 5. Rollback Plan

- [ ] Previous deployment version documented
- [ ] Rollback procedure documented (see below)
- [ ] Stakeholders notified of deployment window

---

## Pre-Deploy Validation Script

Run the automated pre-deploy checks:

```bash
cd backend
./scripts/pre-deploy-check.sh
```

This script validates:
- AWS credentials
- DynamoDB tables (if deployed)
- Lambda function (if deployed)
- All tests passing
- No uncommitted changes

---

## Deployment Steps

### Backend Deployment

```bash
cd backend

# 1. Build the Lambda function
sam build

# 2. Deploy (will prompt for parameters on first deploy)
sam deploy --guided

# Enter parameters when prompted:
# - Stack Name: react-stocks (or your preferred name)
# - AWS Region: us-east-1 (or your preferred region)
# - Parameter TiingoApiKey: [your Tiingo API key]
# - Parameter FinnhubApiKey: [your Finnhub API key]
# - Confirm changes before deploy: Y
# - Allow SAM CLI IAM role creation: Y
# - Save arguments to configuration file: Y

# 3. Note the API Gateway URL from outputs
# Look for: ReactStocksApiUrl = https://xxxxx.execute-api.us-east-1.amazonaws.com
```

### Verify Backend Deployment

```bash
# Test /stocks endpoint
curl "https://your-api-url.execute-api.us-east-1.amazonaws.com/stocks?ticker=AAPL&startDate=2025-01-01&endDate=2025-01-15&type=prices"

# Test /news endpoint
curl "https://your-api-url.execute-api.us-east-1.amazonaws.com/news?ticker=AAPL&from=2025-01-01&to=2025-01-15&limit=10"

# Test /sentiment endpoint (POST)
curl -X POST "https://your-api-url.execute-api.us-east-1.amazonaws.com/sentiment" \
  -H "Content-Type: application/json" \
  -d '{"ticker":"AAPL","startDate":"2025-01-01","endDate":"2025-01-15"}'
```

### Run Cache Warming

```bash
cd backend

# Set environment variables for local script execution
export TIINGO_API_KEY=your_key
export FINNHUB_API_KEY=your_key

# Run cache warming for popular stocks
npm run warm-cache
```

### Deploy CloudWatch Dashboard

```bash
cd backend
npm run create-dashboard
```

### Frontend Deployment (Web)

```bash
cd .. # Return to project root

# 1. Update .env with production API URL
echo "EXPO_PUBLIC_BACKEND_URL=https://your-api-url.execute-api.us-east-1.amazonaws.com" > .env
echo "EXPO_PUBLIC_USE_LAMBDA_SENTIMENT=true" >> .env

# 2. Build web app
npm run build:web

# 3. Deploy to hosting provider (Vercel, Netlify, etc.)
# Example for Vercel:
# vercel --prod

# Example for Netlify:
# netlify deploy --prod --dir=dist
```

### Frontend Deployment (Native)

```bash
# iOS
eas build --platform ios --profile production

# Android
eas build --platform android --profile production

# Or both
eas build --platform all --profile production
```

---

## Post-Deployment Validation

### 1. Smoke Tests

- [ ] Web app loads correctly
- [ ] Can search for stock ticker (e.g., AAPL)
- [ ] Price data displays immediately
- [ ] News data displays immediately
- [ ] Sentiment completes in <15 seconds
- [ ] No console errors

### 2. Cache Performance

- [ ] Open CloudWatch Dashboard
- [ ] Verify cache hit rate >70% (after warming)
- [ ] Check Lambda duration <500ms cold start
- [ ] Check Lambda errors = 0

### 3. Cost Monitoring

- [ ] AWS Cost Explorer shows DynamoDB costs
- [ ] Costs within expected range (~$0.30/day)
- [ ] Billing alarm configured (see COST_OPTIMIZATION.md)

### 4. Error Monitoring

- [ ] CloudWatch Logs accessible
- [ ] No Lambda errors in last hour
- [ ] No DynamoDB throttling errors
- [ ] API Gateway 5XX errors = 0

---

## Monitoring (First 24 Hours)

After deployment, monitor these metrics:

### Hourly Checks (First 6 Hours)

- [ ] CloudWatch Dashboard - no red alerts
- [ ] Lambda error count = 0
- [ ] API Gateway 5XX errors = 0
- [ ] DynamoDB throttling = 0

### Daily Checks (First Week)

- [ ] Cache hit rate trending >70%
- [ ] Average Lambda duration <200ms (warm)
- [ ] DynamoDB costs within budget
- [ ] User feedback positive (no reported errors)

### Week 1 Review

- [ ] Total Lambda invocations
- [ ] Total DynamoDB read/write operations
- [ ] Actual costs vs estimated costs
- [ ] Any production issues logged

---

## Rollback Procedure

If critical issues occur, follow this rollback plan:

### Option 1: Feature Flag Rollback (Fastest)

```bash
# In frontend .env, disable Lambda sentiment
EXPO_PUBLIC_USE_LAMBDA_SENTIMENT=false

# Redeploy frontend only
npm run build:web
# Re-deploy to hosting provider
```

This immediately falls back to local sentiment processing.

### Option 2: Full Backend Rollback

```bash
cd backend

# Rollback to previous CloudFormation stack
aws cloudformation update-stack \
  --stack-name react-stocks \
  --use-previous-template \
  --parameters file://previous-parameters.json

# Or delete and redeploy previous version
sam deploy --guided
```

### Option 3: Emergency Shutdown

```bash
# Disable API Gateway endpoint temporarily
aws apigateway update-stage \
  --rest-api-id your-api-id \
  --stage-name Prod \
  --patch-operations op=replace,path=/throttle/burstLimit,value=0
```

---

## Production Health Checklist

Use this for ongoing production health monitoring:

### Weekly

- [ ] Review CloudWatch Dashboard
- [ ] Check AWS Cost Explorer for DynamoDB costs
- [ ] Review Lambda execution duration trends
- [ ] Check cache hit rate (should be >80% after warming)

### Monthly

- [ ] Review DynamoDB table sizes
- [ ] Analyze slow Lambda executions (if any)
- [ ] Review and optimize TTL settings if needed
- [ ] Update dependencies (security patches)

### Quarterly

- [ ] Review overall AWS costs vs budget
- [ ] Performance optimization opportunities
- [ ] Consider provisioned concurrency if cold starts issue
- [ ] Review and update deprecated code removal plan

---

## Troubleshooting

### Issue: Lambda Cold Starts Too Slow

**Symptoms**: First request after idle period takes >1s

**Solutions**:
1. Increase memory (already at 1024MB)
2. Consider provisioned concurrency (costs money)
3. Use CloudWatch to identify slow imports

### Issue: Cache Hit Rate Low (<50%)

**Symptoms**: Too many API calls, slow performance

**Solutions**:
1. Run cache warming: `npm run warm-cache`
2. Check if TTL too short (increase if needed)
3. Verify cache warming runs post-deploy

### Issue: DynamoDB Throttling

**Symptoms**: ProvisionedThroughputExceededException errors

**Solutions**:
1. Already using PAY_PER_REQUEST (should auto-scale)
2. Check for hot partition (single ticker over-queried)
3. Review batch sizes (should be ≤25 items)

### Issue: High DynamoDB Costs

**Symptoms**: Costs >$20/month for 100 users

**Solutions**:
1. Check cache hit rate (should be >70%)
2. Review TTL settings (may be too long)
3. Look for duplicate writes (deduplication issue)
4. See COST_OPTIMIZATION.md for detailed analysis

---

## Emergency Contacts

- **AWS Support**: [AWS Support Console](https://console.aws.amazon.com/support/home)
- **CloudWatch Logs**: [CloudWatch Logs Console](https://console.aws.amazon.com/cloudwatch/home#logsV2:log-groups)
- **Cost Explorer**: [AWS Cost Explorer](https://console.aws.amazon.com/cost-management/home#/cost-explorer)

---

## Success Criteria

Deployment is successful when:

- ✅ All smoke tests pass
- ✅ Cache hit rate >70%
- ✅ Lambda cold start <500ms
- ✅ Lambda warm execution <200ms
- ✅ DynamoDB costs <$20/month projected
- ✅ No errors in first 24 hours
- ✅ User feedback positive

## Congratulations on your deployment! 🎉
