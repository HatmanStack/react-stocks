# Integration Tests

These tests verify the deployed backend API against live AWS infrastructure.

## Prerequisites

1. **Deploy the backend**:
   ```bash
   cd backend
   npm run deploy:guided  # First time
   # OR
   npm run deploy         # Subsequent deployments
   ```

2. **Get the API Gateway URL** from the deployment output:
   ```
   Outputs:
   ReactStocksApiUrl = https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com
   ```

3. **Set the environment variable**:
   ```bash
   export API_GATEWAY_URL="https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com"
   ```

## Running Integration Tests

```bash
# Run all integration tests
npm run test:integration

# Run specific integration test
npm test -- __tests__/integration/api.integration.test.ts
```

## What Gets Tested

- ✅ Stock prices endpoint (real Tiingo API calls)
- ✅ Symbol metadata endpoint
- ✅ News endpoint (real Polygon API calls)
- ✅ Parameter validation (400 errors)
- ✅ CORS headers
- ✅ Error handling (404, 405)
- ✅ Response format consistency

## Expected Results

All tests should pass if:
- Backend is deployed successfully
- API keys are configured correctly in Lambda environment
- API Gateway URL is set correctly
- Tiingo and Polygon APIs are operational

## Troubleshooting

**Tests fail with "API_GATEWAY_URL environment variable not set"**
- Solution: Export the API Gateway URL from deployment outputs

**Tests timeout**
- Solution: Check Lambda execution time in CloudWatch logs
- May need to increase timeout in Lambda configuration

**Tests fail with 500 errors**
- Solution: Check CloudWatch logs for Lambda errors
- Verify API keys are set correctly: `aws lambda get-function-configuration --function-name ReactStocksFunction`

**Tests fail with 403/401 errors from Tiingo/Polygon**
- Solution: Verify API keys are valid
- Check API rate limits haven't been exceeded
