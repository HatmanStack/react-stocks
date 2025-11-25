<div align="center">

# Stock Insights Backend

[![AWS Lambda](https://img.shields.io/badge/AWS%20Lambda-FF9900?style=for-the-badge&logo=awslambda&logoColor=white)](https://aws.amazon.com/lambda/)
[![DynamoDB](https://img.shields.io/badge/DynamoDB-4053D6?style=for-the-badge&logo=amazondynamodb&logoColor=white)](https://aws.amazon.com/dynamodb/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)

**Serverless backend for stock data and sentiment analysis.**

AWS Lambda backend proxying Tiingo and Finnhub APIs with intelligent DynamoDB caching for optimal performance and cost efficiency.

---

</div>

## ✨ Features

* 🚀 **Serverless Architecture** - Auto-scaling Lambda + HTTP API Gateway for cost-effective API proxy
* 💾 **Smart Caching** - DynamoDB with TTL (90d/1d stocks, 7d news, 30d sentiment) for >80% hit rate
* ⚡ **Performance Optimization** - API Gateway response caching, gzip compression, and optimized Lambda configuration
* 🔒 **Security First** - API keys encrypted in Lambda environment, never exposed to frontend
* 📊 **Stock Data** - Real-time OHLCV prices + company metadata via Tiingo
* 📰 **News Feed** - Financial news articles with deduplication via Finnhub
* 🧠 **Sentiment Analysis** - Asynchronous Lambda-based sentiment processing with job tracking
* 💰 **Cost Optimized** - ~$9-12/month for 100 users with 80% cache hit rate
* 📈 **Monitoring** - CloudWatch metrics, X-Ray tracing, custom dashboards

---

## 🚀 Quick Start

```bash
# Prerequisites
npm run validate  # Checks AWS CLI, SAM CLI, credentials

# Deploy
cd backend
npm install
npm run deploy:guided  # First time - prompts for API keys
npm run deploy         # Subsequent deploys (prompts for optimization settings)

# API Gateway URL auto-updates frontend .env
```

---

## 📡 API Endpoints

| Endpoint | Method | Description | Cache TTL |
|----------|--------|-------------|-----------|
| `/stocks` | GET | Stock prices & metadata (Tiingo proxy) | 5 minutes (API Gateway) |
| `/news` | GET | Financial news articles (Finnhub proxy) | 2 minutes (API Gateway) |
| `/sentiment` | POST | Start sentiment analysis job | - |
| `/sentiment/job/{jobId}` | GET | Check job status | - |
| `/sentiment` | GET | Get sentiment results | 5 minutes (API Gateway) |

**Note:** API Gateway Caching reduces Lambda invocations. DynamoDB caching stores data for longer periods (up to 90 days).

---

## ⚙️ Configuration & Optimization

The deployment script (`npm run deploy`) supports interactive configuration for:

- **API Gateway Caching**: Enable/disable response caching (default: enabled, 0.5GB)
- **Response Compression**: Gzip compression automatically enabled for responses >1KB
- **Lambda Memory/Timeout**: Optimized per endpoint type (Stocks, News, Search, Sentiment, Predict)
- **Provisioned Concurrency**: Optional configuration for market-hour scaling (reduces cold starts)

### Cache TTL Strategy

| Data Type | DynamoDB TTL | API Gateway TTL |
|-----------|--------------|-----------------|
| Historical Stocks | 90 days | 5 minutes |
| Current Stocks | 1 day | 5 minutes |
| News | 7 days | 2 minutes |
| Sentiment | 30 days | 5 minutes |
| Metadata | 30 days | 1 hour |

---

## 💻 Tech Stack

* **Runtime:** Node.js 20.x, TypeScript 5
* **Infrastructure:** AWS Lambda + API Gateway HTTP API + DynamoDB
* **Deployment:** AWS SAM (Infrastructure as Code)
* **APIs:** Tiingo (stocks), Finnhub (news)
* **Monitoring:** CloudWatch Logs, X-Ray tracing
* **Testing:** Jest (>80% coverage), integration tests

---

## 🔧 Available Scripts

```bash
# Deployment
npm run deploy:guided      # First-time deployment with prompts
npm run deploy             # Build + deploy + update frontend .env
npm run validate           # Check AWS prerequisites
npm run update-env         # Manually update frontend .env with API URL

# Development
npm run build              # Compile TypeScript
npm test                   # Run unit tests
npm run test:coverage      # Coverage report (target: >80%)
npm run test:integration   # Integration tests (requires deployed backend)
sam local start-api        # Run Lambda locally

# Monitoring
npm run logs               # View Lambda CloudWatch logs
npm run warm-cache         # Pre-populate DynamoDB cache
npm run create-dashboard   # Create CloudWatch dashboard
```

---

## 💰 Cost Estimate

**Target:** <$20/month for 100 users ✅
**Projected:** $9-12/month

| Service | Monthly Cost | Notes |
|---------|--------------|-------|
| DynamoDB | ~$9 | 80% cache hit rate, pay-per-request |
| Lambda | ~$0 | Free tier covers most usage (reduced by caching) |
| API Gateway | ~$1 | HTTP API + Caching (~$0.02/hour for cache) |
| CloudWatch | ~$1 | Logs + custom metrics |

**Cost optimization:**
- API Gateway Response Caching (reduces Lambda calls)
- Response Compression (reduces data transfer)
- DynamoDB TTL Optimization (reduces storage)
- Target >80% cache hit rate
- Pay-per-request billing (auto-scales, no idle costs)

---

## 🔐 Production Checklist

**Pre-Deploy:**
- [ ] Tests pass (`npm test`)
- [ ] TypeScript compiles (`npm run type-check`)
- [ ] AWS credentials configured
- [ ] Tiingo + Finnhub API keys ready
- [ ] **CORS configured** (update `AllowedOrigins` in template.yaml)

**Deploy:**
```bash
sam build && sam deploy
npm run warm-cache
npm run create-dashboard
```

**Verify:**
- [ ] All API endpoints respond
- [ ] Cache hit rate >70%
- [ ] No Lambda errors
- [ ] Frontend `.env` updated

### CORS Security

⚠️ **IMPORTANT:** Default allows `*` (all origins). **Always restrict in production:**

```bash
# Single domain
sam deploy --parameter-overrides AllowedOrigins="https://your-domain.com"

# Multiple domains
sam deploy --parameter-overrides AllowedOrigins="https://prod.com,https://staging.com"
```

---

## 🔧 Troubleshooting

### Deployment

| Issue | Fix |
|-------|-----|
| "Unable to upload artifact" | `sam deploy --guided --resolve-s3` |
| "API key not configured" | `sam deploy --parameter-overrides TiingoApiKey="key" FinnhubApiKey="key"` |
| Permission errors | Verify IAM permissions: `aws sts get-caller-identity` |

### Runtime

| Issue | Fix |
|-------|-----|
| CORS errors | Update `AllowedOrigins` parameter (see Production Checklist) |
| Function timeout | Increase `Timeout` in `template.yaml` (default: 30s) |
| Cold starts >1s | Run `npm run warm-cache` or enable provisioned concurrency |
| Cache hit <50% | Run `npm run warm-cache`, verify TTL settings |
| High costs | Check cache hit rate >70%, review access patterns |

---

## 🔄 Rollback

**Quick rollback** (frontend feature flag):
```bash
# .env
EXPO_PUBLIC_USE_LAMBDA_SENTIMENT=false
```

**Full backend rollback:**
```bash
sam deploy --guided  # Deploy previous SAM template
```

---

## 📜 License

This project is licensed under the terms of the MIT License.
