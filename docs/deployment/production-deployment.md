# Production Deployment Guide

This guide provides step-by-step instructions for deploying the React Stocks application to production.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Backend Deployment](#backend-deployment)
4. [Frontend Deployment](#frontend-deployment)
5. [Post-Deployment Verification](#post-deployment-verification)
6. [Rollback Procedure](#rollback-procedure)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### AWS Account Setup

- **AWS Account**: Production AWS account with appropriate permissions
- **IAM User/Role**: Permissions for CloudFormation, Lambda, API Gateway, S3, IAM, CloudWatch
- **AWS CLI**: Installed and configured (`aws configure`)
- **SAM CLI**: Version 1.70.0+ installed

### API Keys

- **Tiingo API Key**: Active key for stock price data
- **Polygon API Key**: Active key for news data

### Development Environment

- **Node.js**: v18+ (project uses v24 LTS)
- **npm**: Latest version
- **Git**: Repository cloned and up to date

### Production Infrastructure

- **Domain** (optional): Custom domain for API (e.g., `api.yourdomain.com`)
- **Frontend Hosting**: Vercel, Netlify, AWS S3, or Expo hosting
- **Mobile App Distribution**: Apple App Store, Google Play Store (if deploying mobile)

---

## Pre-Deployment Checklist

Complete this checklist before deploying to production:

### Code Quality

- [ ] All tests passing (`npm test`)
- [ ] Build successful (`npm run build`)
- [ ] No TypeScript errors (`npm run type-check`)
- [ ] Linter clean (`npm run lint`)
- [ ] Security audit clean (`npm audit --production`)

### Security

- [ ] Security audit completed (see `docs/security/security-audit.md`)
- [ ] No API keys in code (verified with grep)
- [ ] CORS origins configured for production domains
- [ ] Rate limiting configured (if applicable)
- [ ] CloudWatch alarms configured

### Configuration

- [ ] Production SAM configuration updated (`backend/samconfig.toml`)
- [ ] Production environment file created (`.env.production`)
- [ ] API keys ready (Tiingo, Polygon)
- [ ] Allowed CORS origins determined

### Documentation

- [ ] Deployment documentation reviewed
- [ ] Runbook prepared (see `docs/operations/runbook.md`)
- [ ] Team notified of deployment window
- [ ] Rollback plan reviewed

---

## Backend Deployment

### Option 1: Automated Deployment (Recommended)

Use the provided deployment script:

```bash
# From project root
./scripts/deploy-production.sh
```

The script will:
1. Run tests and security audit
2. Prompt for API keys
3. Build and deploy backend to AWS
4. Output API Gateway URL
5. Provide frontend deployment instructions

### Option 2: Manual Deployment

If you prefer manual deployment:

#### 1. Navigate to Backend Directory

```bash
cd backend
```

#### 2. Build Lambda Function

```bash
sam build --use-container
```

#### 3. Deploy to AWS

```bash
sam deploy \
  --config-env production \
  --parameter-overrides \
    TiingoApiKey=YOUR_TIINGO_KEY \
    PolygonApiKey=YOUR_POLYGON_KEY \
    AllowedOrigins=https://yourdomain.com
```

**Note**: Replace `YOUR_TIINGO_KEY`, `YOUR_POLYGON_KEY`, and `https://yourdomain.com` with actual values.

#### 4. Confirm Deployment

SAM will show a changeset. Review carefully and confirm with `y`.

#### 5. Note API Gateway URL

After deployment, SAM outputs the API Gateway URL:

```
Outputs
ReactStocksApiUrl = https://abc123.execute-api.us-east-1.amazonaws.com
```

**Save this URL** - you'll need it for frontend configuration.

### Deployment Verification

```bash
# Test stocks endpoint
curl "https://YOUR_API_URL/stocks?ticker=AAPL&startDate=2024-01-01&endDate=2024-01-31"

# Test news endpoint
curl "https://YOUR_API_URL/news?ticker=AAPL&limit=10"
```

Both should return JSON data without errors.

---

## Frontend Deployment

### 1. Update Environment Configuration

Update `.env.production` with the API Gateway URL from backend deployment:

```env
EXPO_PUBLIC_BACKEND_URL=https://YOUR_API_URL.execute-api.us-east-1.amazonaws.com
EXPO_PUBLIC_BROWSER_SENTIMENT=true
EXPO_PUBLIC_BROWSER_PREDICTION=true
```

### 2. Build Frontend

```bash
npm run build:production
```

### 3. Deploy to Hosting Platform

#### Option A: Web Deployment (Vercel)

```bash
# Install Vercel CLI (if not already)
npm install -g vercel

# Deploy
vercel --prod
```

#### Option B: Web Deployment (Netlify)

```bash
# Install Netlify CLI (if not already)
npm install -g netlify-cli

# Deploy
netlify deploy --prod
```

#### Option C: Web Deployment (AWS S3 + CloudFront)

```bash
# Build for web
npm run build:web

# Upload to S3
aws s3 sync web-build/ s3://your-bucket-name/ --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

#### Option D: Mobile Deployment (Expo EAS)

```bash
# iOS
eas build --platform ios
eas submit --platform ios

# Android
eas build --platform android
eas submit --platform android
```

**Note**: Mobile deployment requires Expo account and app store developer accounts.

---

## Post-Deployment Verification

### Smoke Tests

Run smoke tests to verify deployment:

```bash
# Set production API URL
export API_GATEWAY_URL=https://YOUR_API_URL.execute-api.us-east-1.amazonaws.com

# Run integration tests
cd backend
npm test -- __tests__/integration/
```

### Manual Testing

1. **Open App**: Navigate to production URL
2. **Search Stock**: Search for "AAPL"
3. **View Details**: Click on stock to view details
4. **Check Tabs**: Verify Price, News, and Sentiment tabs load
5. **Add to Portfolio**: Add stock to portfolio
6. **Sync Data**: Trigger data sync (should call Lambda backend)
7. **View Predictions**: Verify predictions appear
8. **Offline Test**: Disable network, verify ML models still work
9. **Remove from Portfolio**: Remove stock from portfolio

### Monitor CloudWatch

1. Open AWS Console → CloudWatch
2. Navigate to Logs → Log Groups
3. Find `/aws/lambda/react-stocks-backend-prod-*`
4. Verify requests appearing in logs
5. Check for any errors

### Verify Metrics

1. CloudWatch → Metrics → Lambda
2. Check metrics for `react-stocks-backend-prod-*`:
   - Invocations: Should increase with app usage
   - Duration: Should be < 1000ms typically
   - Errors: Should be 0 or very low
   - Throttles: Should be 0

---

## Rollback Procedure

If issues are discovered after deployment:

### Backend Rollback

#### Option 1: Redeploy Previous Version

```bash
cd backend

# Use previous stack parameters
sam deploy \
  --config-env production \
  --parameter-overrides \
    TiingoApiKey=YOUR_KEY \
    PolygonApiKey=YOUR_KEY
```

#### Option 2: CloudFormation Rollback

1. AWS Console → CloudFormation
2. Select stack `react-stocks-backend-prod`
3. Actions → Create change set → Execute change set
4. Or manually rollback in Stack Actions

### Frontend Rollback

#### Vercel/Netlify

Use platform's rollback feature to previous deployment.

#### S3/CloudFront

```bash
# Restore previous build from backup
aws s3 sync s3://your-backup-bucket/ s3://your-live-bucket/ --delete

# Invalidate cache
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

### Mobile App Rollback

Cannot rollback mobile apps instantly. Options:
1. Submit hotfix update
2. Remove app from stores temporarily (extreme cases only)

---

## Troubleshooting

### Backend Issues

#### Lambda Timeout

**Symptom**: Requests timing out after 30 seconds

**Solution**:
```bash
# Increase timeout in template.yaml
Globals:
  Function:
    Timeout: 60  # Increase from 30

# Redeploy
sam deploy --config-env production
```

#### High Error Rate

**Check**:
1. CloudWatch Logs for error messages
2. Verify API keys are correct
3. Check external API status (Tiingo, Polygon)

**Fix**:
```bash
# Update API keys if needed
sam deploy --config-env production \
  --parameter-overrides \
    TiingoApiKey=NEW_KEY \
    PolygonApiKey=NEW_KEY
```

#### CORS Errors

**Symptom**: Browser shows CORS errors

**Fix**:
```bash
# Update allowed origins
sam deploy --config-env production \
  --parameter-overrides \
    AllowedOrigins=https://yourdomain.com,https://www.yourdomain.com
```

### Frontend Issues

#### "Network Error" on All Requests

**Check**:
1. Verify `EXPO_PUBLIC_BACKEND_URL` is correct
2. Test API URL directly: `curl https://YOUR_API_URL/stocks?ticker=AAPL&startDate=2024-01-01`
3. Check browser console for CORS errors

**Fix**:
- Update `.env.production` with correct URL
- Rebuild and redeploy frontend

#### ML Models Not Working

**Check**:
1. Verify feature flags: `EXPO_PUBLIC_BROWSER_SENTIMENT=true`
2. Check browser console for JavaScript errors
3. Test with simple input

**Fix**:
- Update feature flags in `.env.production`
- Clear browser cache
- Rebuild frontend

#### Database Not Persisting

**Web**: Check if localStorage is enabled
**Native**: Check app permissions

### Performance Issues

#### Slow Response Times

**Check**:
1. CloudWatch Metrics → Lambda Duration
2. External API response times

**Fix**:
```bash
# Increase Lambda memory (also increases CPU)
# Update template.yaml:
MemorySize: 1024  # Increase from 512

# Redeploy
sam deploy --config-env production
```

#### High Costs

**Check**:
1. AWS Cost Explorer
2. Lambda invocations count
3. API Gateway requests

**Fix**:
- Add API Gateway throttling
- Review application usage patterns
- Consider Lambda reserved concurrency

---

## Cost Monitoring

### Expected Monthly Costs (Low Traffic)

- **Lambda**: ~$5-10 (first 1M requests free)
- **API Gateway**: ~$3-5 (first 1M requests: $1)
- **CloudWatch Logs**: ~$1-2
- **Total**: ~$10-20/month

### Cost Optimization

1. **Lambda**: Right-size memory (higher memory = faster, but costs more)
2. **API Gateway**: Use HTTP API (70% cheaper than REST API) ✅ Already implemented
3. **CloudWatch Logs**: Set retention period to 30 days
4. **Monitor**: Set up AWS Budget alerts

---

## Security Monitoring

### Daily

- [ ] Check CloudWatch Logs for errors
- [ ] Review CloudWatch Alarms

### Weekly

- [ ] Review API Gateway access logs
- [ ] Check Lambda invocation patterns
- [ ] Run security scan: `npm audit`

### Monthly

- [ ] Review IAM permissions
- [ ] Check for unused resources
- [ ] Update dependencies

---

## Support and Escalation

### Documentation

- Security Issues: `docs/security/security-audit.md`
- Monitoring: `docs/operations/monitoring-guide.md`
- Runbook: `docs/operations/runbook.md`

### Contacts

| Issue Type | Contact | Response Time |
|------------|---------|---------------|
| Critical (outage) | On-call engineer | Immediate |
| High (errors) | Development team | < 4 hours |
| Medium (performance) | Development team | < 24 hours |
| Low (feature request) | Product team | Next sprint |

---

## Appendix

### Useful Commands

```bash
# View CloudFormation stack status
aws cloudformation describe-stacks --stack-name react-stocks-backend-prod

# View Lambda logs
sam logs --stack-name react-stocks-backend-prod --tail

# Update stack parameters only (no code change)
sam deploy --config-env production --parameter-overrides TiingoApiKey=NEW_KEY

# Delete stack (⚠️ DANGER - only for cleanup)
aws cloudformation delete-stack --stack-name react-stocks-backend-prod
```

### CloudFormation Outputs

```bash
# Get API Gateway URL
aws cloudformation describe-stacks \
  --stack-name react-stocks-backend-prod \
  --query 'Stacks[0].Outputs[?OutputKey==`ReactStocksApiUrl`].OutputValue' \
  --output text
```

---

**Document Version**: 1.0
**Last Updated**: 2025-11-12
**Next Review**: After first production deployment
