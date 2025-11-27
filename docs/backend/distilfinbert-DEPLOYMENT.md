# DistilFinBERT Deployment Guide

Complete guide for deploying the DistilFinBERT sentiment analysis service to AWS Lambda.

## Prerequisites

### Required Tools
- AWS CLI 2.0+ configured with credentials
- SAM CLI 1.90+ installed
- Docker 20.0+ running
- 5GB+ free disk space

### AWS Permissions Required
Your AWS user/role needs these IAM permissions:
- `lambda:CreateFunction`, `lambda:UpdateFunctionCode`
- `ecr:CreateRepository`, `ecr:PutImage`, `ecr:GetAuthorizationToken`
- `apigateway:POST`, `apigateway:PUT`, `apigateway:GET`
- `iam:CreateRole`, `iam:AttachRolePolicy`
- `cloudformation:CreateStack`, `cloudformation:UpdateStack`
- `logs:CreateLogGroup`, `logs:PutRetentionPolicy`

### Cost Estimation
Expected costs for 10,000 requests/day (assuming 80% cache hit rate = 2,000 Lambda invocations):

- **Lambda compute**: ~$3-5/month (2,000 invocations × 500ms × 2GB memory)
- **Lambda storage**: ~$1/month (1GB ephemeral storage)
- **API Gateway**: ~$0.50/month (10,000 requests)
- **CloudWatch Logs**: ~$0.50/month (7 days retention)
- **ECR storage**: ~$0.10/month (Docker image storage)

**Total**: ~$5-7/month

## Deployment Steps

### Step 1: Verify Prerequisites

```bash
# Check tools are installed
python3 --version    # Should be 3.9+
docker --version     # Should be 20.0+
aws --version        # Should be 2.0+
sam --version        # Should be 1.90+

# Check AWS credentials
aws sts get-caller-identity

# Check Docker is running
docker ps
```

### Step 2: Configure Environment

```bash
# Set environment (dev, staging, or prod)
export ENVIRONMENT=prod

# Set AWS region
export AWS_REGION=us-east-1

# Optional: Set custom image name
export IMAGE_NAME=distilfinbert
```

### Step 3: Run Deployment

```bash
cd distilfinbert-service

# First-time deployment (guided)
./deploy.sh

# Subsequent deployments (uses saved config)
./deploy.sh
```

The script will:
1. Create ECR repository (if needed)
2. Authenticate Docker to ECR
3. Build Docker image (~5-10 minutes first time)
4. Push image to ECR (~2-3 minutes)
5. Deploy with SAM (~3-5 minutes)
6. Output API Gateway URL

### Step 4: Verify Deployment

```bash
# Test health endpoint
API_URL=$(aws cloudformation describe-stacks \
  --stack-name distilfinbert-prod \
  --query 'Stacks[0].Outputs[?OutputKey==`DistilFinBERTApiUrl`].OutputValue' \
  --output text)

curl ${API_URL}/health

# Expected response:
# {"status":"healthy","model_loaded":true,"model_info":{...}}
```

### Step 5: Test Sentiment Analysis

```bash
# Test single sentiment
curl -X POST ${API_URL}/sentiment \
  -H "Content-Type: application/json" \
  -d '{"text":"Apple reports record earnings, beating estimates"}'

# Expected response:
# {"sentiment":0.75,"confidence":0.88,"label":"positive","probabilities":{...}}

# Test batch sentiment
curl -X POST ${API_URL}/sentiment/batch \
  -H "Content-Type: application/json" \
  -d '{"texts":["Earnings beat expectations","Stock drops on miss"]}'
```

### Step 6: Monitor First Invocation

The first invocation will be slow (cold start):

```bash
# Watch CloudWatch logs in real-time
sam logs --stack-name distilfinbert-prod --tail

# Or use AWS CLI
aws logs tail /aws/lambda/distilfinbert-sentiment-prod --follow
```

Expected cold start sequence:
1. Container initialization (2-3 seconds)
2. Model download (~5 seconds)
3. Model loading (~2-3 seconds)
4. Inference (<1 second)

**Total first request**: 10-15 seconds

Subsequent requests (warm starts): <500ms

### Step 7: Update Backend Environment

Add the API URL to your backend Lambda environment:

```bash
# Get the API URL
API_URL=$(aws cloudformation describe-stacks \
  --stack-name distilfinbert-prod \
  --query 'Stacks[0].Outputs[?OutputKey==`DistilFinBERTApiUrl`].OutputValue' \
  --output text)

# Update backend Lambda environment variable
cd ../backend
sam deploy --parameter-overrides DistilFinBERTApiUrl=${API_URL}

# Or manually add to backend/template.yaml:
# Environment:
#   Variables:
#     DISTILFINBERT_API_URL: <API_URL>
```

## Configuration

### API Gateway Throttling

By default, no throttling is configured. To prevent abuse:

```bash
# Set throttling limits
aws apigatewayv2 update-stage \
  --api-id <API_ID> \
  --stage-name prod \
  --route-settings \
    '{"$default":{"ThrottlingBurstLimit":50,"ThrottlingRateLimit":20}}'
```

Recommended settings:
- **Burst limit**: 50 requests/second (handles spikes)
- **Rate limit**: 20 requests/second (sustained)

### CloudWatch Alarms

Alarms are automatically created by SAM template:

1. **Error rate**: Triggers if errors exceed 5% over 5 minutes
2. **Duration**: Triggers if average duration exceeds 10 seconds
3. **Throttles**: Triggers on any throttling

To receive email notifications:

```bash
# Create SNS topic
aws sns create-topic --name distilfinbert-alerts

# Subscribe your email
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:ACCOUNT_ID:distilfinbert-alerts \
  --protocol email \
  --notification-endpoint your-email@example.com

# Update alarms to use SNS topic (modify template.yaml)
```

### Memory and Timeout Tuning

Default settings (in template.yaml):
- Memory: 2048MB
- Timeout: 30 seconds
- Ephemeral storage: 1024MB

To adjust:

```yaml
# template.yaml
Globals:
  Function:
    Timeout: 45        # Increase if inference is slow
    MemorySize: 3008   # Increase if out-of-memory errors
```

Then redeploy:
```bash
./deploy.sh
```

## Troubleshooting

### Issue: Model Fails to Load

**Symptoms**: 500 errors, logs show "Failed to load model"

**Solutions**:
1. Check Lambda memory is 2048MB+
2. Verify ephemeral storage is 1024MB+
3. Check `/tmp` space in logs
4. Try increasing memory to 3008MB

### Issue: Cold Starts Too Slow

**Symptoms**: First requests take >15 seconds

**Solutions**:
1. Enable provisioned concurrency:
   ```bash
   aws lambda put-provisioned-concurrency-config \
     --function-name distilfinbert-sentiment-prod \
     --provisioned-concurrent-executions 1
   ```
   Cost: ~$10/month for 1 warm instance

2. Pre-download model during image build:
   ```dockerfile
   # In Dockerfile, add before CMD:
   RUN python -c "from app.model import load_model; load_model()"
   ```
   This increases image size but speeds up cold starts

### Issue: Out of Memory

**Symptoms**: Lambda killed due to memory limit

**Solutions**:
1. Increase Lambda memory to 3008MB
2. Reduce batch size (max 5 instead of 10)
3. Check for memory leaks in model caching

### Issue: API Gateway 403 Errors

**Symptoms**: CORS errors in browser

**Solutions**:
1. Verify CORS configuration in template.yaml
2. Check AllowOrigins includes your frontend domain
3. Ensure preflight OPTIONS requests succeed

### Issue: High Costs

**Symptoms**: AWS bill higher than expected

**Analysis**:
```bash
# Check invocation count
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=distilfinbert-sentiment-prod \
  --start-time $(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 86400 \
  --statistics Sum

# Check cache hit rate (should be >80%)
# Low cache hit rate = more Lambda invocations = higher cost
```

**Solutions**:
1. Verify backend is caching results in DynamoDB
2. Increase cache TTL (30 days is good)
3. Ensure cache lookup happens before API call
4. Monitor cache hit rate metric

## Monitoring

### View Logs

```bash
# Real-time logs
sam logs --stack-name distilfinbert-prod --tail

# Last 10 minutes
sam logs --stack-name distilfinbert-prod --start-time '10min ago'

# Filter errors only
aws logs filter-log-events \
  --log-group-name /aws/lambda/distilfinbert-sentiment-prod \
  --filter-pattern "ERROR"
```

### Key Metrics to Monitor

1. **Invocations**: Total requests (should be low with caching)
2. **Duration**: Average response time (target: <500ms warm)
3. **Errors**: Error rate (target: <1%)
4. **Throttles**: API Gateway throttling (target: 0)
5. **Cache hit rate**: DynamoDB cache effectiveness (target: >80%)

CloudWatch dashboard:
```bash
# Create custom dashboard
aws cloudwatch put-dashboard \
  --dashboard-name DistilFinBERT \
  --dashboard-body file://dashboard.json
```

## Updating the Service

### Update Code

1. Make changes to `app/` files
2. Test locally with `docker build -f Dockerfile.local . && docker run ...`
3. Deploy update: `./deploy.sh`

SAM will detect changes and update only modified resources.

### Update Model

To switch to a different DistilFinBERT model:

1. Update `MODEL_NAME` in template.yaml:
   ```yaml
   Environment:
     Variables:
       MODEL_NAME: some-org/other-finbert-model
   ```

2. Redeploy:
   ```bash
   ./deploy.sh
   ```

3. Model will download on first invocation after update

### Rollback

If deployment fails or has issues:

```bash
# List previous versions
aws lambda list-versions-by-function \
  --function-name distilfinbert-sentiment-prod

# Rollback to previous version
aws lambda update-alias \
  --function-name distilfinbert-sentiment-prod \
  --name prod \
  --function-version <PREVIOUS_VERSION>
```

## Cleanup

To remove all resources and stop costs:

```bash
# Delete CloudFormation stack
aws cloudformation delete-stack --stack-name distilfinbert-prod

# Delete ECR images
aws ecr delete-repository \
  --repository-name distilfinbert \
  --force

# Verify deletion
aws cloudformation describe-stacks --stack-name distilfinbert-prod
# Should show: Stack with id distilfinbert-prod does not exist
```

## Security Best Practices

1. **Restrict CORS**: Update AllowOrigins to specific frontend domains
2. **Enable VPC**: If accessing private resources, deploy Lambda in VPC
3. **Use Secrets Manager**: For API keys (if model requires authentication)
4. **Enable WAF**: Add AWS WAF to API Gateway for DDoS protection
5. **Implement authentication**: Add API keys or JWT validation for production

Example API key authentication:
```yaml
# template.yaml
Auth:
  ApiKeyRequired: true
```

## Support

For issues:
- **AWS-related**: Check AWS SAM documentation
- **Model-related**: Check ProsusAI/FinBERT documentation
- **Service code**: Check application logs and README.md
