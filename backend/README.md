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

* 🚀 **Serverless Architecture** - Auto-scaling Lambda + HTTP API Gateway v2 for cost-effective API proxy
* 💾 **Smart Caching** - DynamoDB with variable TTL (90d historical, 1d current, 7d news, 30d sentiment) for >80% hit rate
* ⚡ **Performance Optimization** - Gzip compression, per-endpoint Lambda tuning, optional provisioned concurrency
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

| Endpoint | Method | Description | DynamoDB Cache |
|----------|--------|-------------|----------------|
| `/stocks` | GET | Stock prices & metadata (Tiingo proxy) | 90d (historical) / 1d (current) |
| `/news` | GET | Financial news articles (Finnhub proxy) | 7 days |
| `/sentiment` | POST | Start sentiment analysis job | - |
| `/sentiment/job/{jobId}` | GET | Check job status | 1 day |
| `/sentiment` | GET | Get sentiment results | 30 days |

**Note:** DynamoDB caching reduces external API calls and provides fast response times. HTTP API v2 automatically compresses responses >1KB when client sends `Accept-Encoding: gzip` header.

---

## ⚙️ Configuration & Optimization

### Deployment Configuration

The deployment script (`npm run deploy`) creates a `.deploy-config.json` file (git-ignored) that stores your optimization settings:

```json
{
  "region": "us-east-1",
  "stackName": "stocks-prediction-service",
  "enableProvisionedConcurrency": false,
  "provisionedConcurrency": {
    "marketHours": 5,
    "preMarket": 2
  },
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
  }
}
```

**Configuration Options:**

- **Lambda Memory** (per endpoint): 128-10240 MB
  - Lower memory for I/O-bound endpoints (stocks, news, search)
  - Higher memory for CPU-intensive endpoints (sentiment, predict with ML)
- **Lambda Timeout** (per endpoint): 1-900 seconds
  - Short timeouts for simple queries (<30s)
  - Long timeouts for ML processing (120s)
- **Provisioned Concurrency**: Enable during market hours to eliminate cold starts (optional, costs ~$10/day)
- **Response Compression**: Automatically enabled for all responses >1KB (HTTP API feature)

**Note:** API Gateway v2 HTTP API doesn't support built-in response caching. Use DynamoDB caching instead (already configured).

### Cache TTL Strategy

| Data Type | DynamoDB TTL | Purpose |
|-----------|--------------|---------|
| Historical Stocks | 90 days | Immutable historical data |
| Current Stocks | 1 day | Today's data (intraday updates) |
| News | 7 days | Moderate volatility |
| Sentiment | 30 days | Expensive to recompute |
| Metadata | 30 days | Company info rarely changes |
| Jobs | 1 day | Temporary job status |

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
| API Gateway | ~$1 | HTTP API (DynamoDB handles caching) |
| CloudWatch | ~$1 | Logs + custom metrics |

**Cost optimization:**
- DynamoDB Response Caching (reduces Lambda and external API calls)
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
