# Backend Deployment Guide

## Prerequisites

Before deploying, ensure you have:

- ✅ AWS CLI v2+ configured (`aws configure`)
- ✅ AWS SAM CLI v1.70.0+ installed
- ✅ Valid Tiingo API key ([Get one here](https://api.tiingo.com))
- ✅ Valid Polygon API key ([Get one here](https://polygon.io))
- ✅ Node.js 18+ installed

**Run prerequisite validation:**
```bash
cd /root/react-stocks
npm run validate
```

## First-Time Deployment

### 1. Build the Lambda function

```bash
cd backend
npm install
npm run build
sam build
```

### 2. Deploy with guided mode

```bash
sam deploy --guided
```

**You will be prompted for:**
- **Stack Name**: `react-stocks-backend` (or your preferred name)
- **AWS Region**: `us-east-1` (or your preferred region)
- **TiingoApiKey**: Paste your Tiingo API key
- **PolygonApiKey**: Paste your Polygon API key
- **Confirm changes**: `Y`
- **Allow SAM CLI IAM role creation**: `Y`
- **Disable rollback**: `n` (recommended for first deployment)
- **Save arguments to config**: `Y`

### 3. Note the API URL

After successful deployment, note the output:
```
Outputs:
ReactStocksApiUrl = https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com
```

**Save this URL** - you'll need it for frontend integration in Phase 4.

## Subsequent Deployments

After the first deployment, subsequent updates are simpler:

```bash
cd backend
npm run build
sam build
sam deploy
```

SAM will use the saved configuration from `samconfig.toml`.

## Updating API Keys

To update API keys without redeploying code:

```bash
sam deploy --parameter-overrides \
  TiingoApiKey="new-tiingo-key" \
  PolygonApiKey="new-polygon-key"
```

## Viewing Logs

### Tail live logs

```bash
sam logs -n ReactStocksFunction --stack-name react-stocks-backend --tail
```

### View recent logs

```bash
sam logs -n ReactStocksFunction --stack-name react-stocks-backend
```

### Filter for errors only

```bash
sam logs -n ReactStocksFunction --stack-name react-stocks-backend --filter "ERROR"
```

## Testing the Deployed API

### Test stocks endpoint

```bash
API_URL="https://your-api-id.execute-api.us-east-1.amazonaws.com"

# Fetch stock prices
curl "${API_URL}/stocks?ticker=AAPL&startDate=2024-01-01&endDate=2024-01-31"

# Fetch symbol metadata
curl "${API_URL}/stocks?ticker=AAPL&type=metadata"
```

### Test news endpoint

```bash
# Fetch news articles
curl "${API_URL}/news?ticker=AAPL&limit=10"

# Fetch news with date range
curl "${API_URL}/news?ticker=AAPL&startDate=2024-01-01&endDate=2024-01-31"
```

## Troubleshooting

### Deployment fails with "Unable to upload artifact"

**Issue**: SAM cannot create/access S3 bucket for deployment artifacts.

**Solution**:
```bash
sam deploy --guided --resolve-s3
```

This creates a managed S3 bucket for you.

### "TIINGO_API_KEY not configured" error

**Issue**: API keys not set correctly during deployment.

**Solution**: Redeploy with explicit parameters:
```bash
sam deploy --parameter-overrides \
  TiingoApiKey="your-key" \
  PolygonApiKey="your-key"
```

### CORS errors in browser

**Issue**: Frontend cannot access API due to CORS.

**Solution**: The template includes `Access-Control-Allow-Origin: *`. If you need to restrict origins:

1. Edit `template.yaml`
2. Change `AllowOrigins` under `CorsConfiguration`
3. Redeploy

### Function timing out

**Issue**: Lambda times out before API responds.

**Solution**: Increase timeout in `template.yaml`:
```yaml
Globals:
  Function:
    Timeout: 60  # Increase from 30 to 60 seconds
```

## Rollback

If deployment causes issues, roll back to previous version:

```bash
aws cloudformation describe-stack-events \
  --stack-name react-stocks-backend \
  --query 'StackEvents[0].PhysicalResourceId' \
  --output text

# Then delete the stack to roll back
sam delete --stack-name react-stocks-backend
```

## Clean Up / Uninstall

To completely remove the backend:

```bash
sam delete --stack-name react-stocks-backend
```

This removes:
- Lambda function
- API Gateway
- IAM roles
- CloudWatch log groups

**Note**: S3 deployment bucket is retained. To delete it:
```bash
aws s3 rb s3://aws-sam-cli-managed-default-samclisourcebucket-xxxxx --force
```

## Production Considerations

Before going to production:

1. **Restrict CORS**: Update `AllowOrigins` in template.yaml to your domain
2. **Enable API throttling**: Add rate limiting in API Gateway
3. **Use Secrets Manager**: Move API keys from parameters to AWS Secrets Manager
4. **Add monitoring**: Set up CloudWatch alarms for errors and latency
5. **Enable X-Ray**: Add tracing for debugging
6. **Review IAM permissions**: Ensure least privilege access

## Cost Estimate

With AWS Free Tier:

- **Lambda**: First 1M requests/month free, then $0.20 per 1M requests
- **API Gateway HTTP API**: First 1M requests free, then $1.00 per 1M requests
- **CloudWatch Logs**: First 5GB free, then $0.50/GB

**Estimated monthly cost** (after free tier): $2-5 for moderate usage.

## Next Steps

After successful deployment:
1. Save the API Gateway URL
2. Proceed to **Phase 2**: Browser-based sentiment analysis
3. Update frontend to use new backend (Phase 4)
