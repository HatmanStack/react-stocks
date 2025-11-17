<div align="center">

# Stock Insights Backend

[![](https://img.shields.io/badge/AWS%20Lambda-FF9900?style=for-the-badge&logo=awslambda&logoColor=white)](https://aws.amazon.com/lambda/)
[![](https://img.shields.io/badge/DynamoDB-4053D6?style=for-the-badge&logo=amazondynamodb&logoColor=white)](https://aws.amazon.com/dynamodb/)
[![](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)

**Serverless backend for stock data and sentiment analysis.**

AWS Lambda backend proxying Tiingo and Polygon APIs with intelligent DynamoDB caching for optimal performance and cost efficiency.

---

</div>

## ✨ Features

* 🚀 **Serverless Architecture** - Auto-scaling Lambda + HTTP API Gateway for cost-effective API proxy
* 💾 **Smart Caching** - DynamoDB with TTL (7d stocks, 30d news, 90d sentiment) for >80% hit rate
* 🔒 **Security First** - API keys encrypted in Lambda environment, never exposed to frontend
* ⚡ **High Performance** - <15s sentiment processing, sub-second cache hits
* 📊 **Stock Data** - Real-time OHLCV prices + company metadata via Tiingo
* 📰 **News Feed** - Financial news articles with deduplication via Polygon
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
npm run deploy         # Subsequent deploys

# API Gateway URL auto-updates frontend .env
```

---

## 📡 API Endpoints

| Endpoint | Method | Description | Cache TTL |
|----------|--------|-------------|-----------|
| `/stocks` | GET | Stock prices & metadata (Tiingo proxy) | 7 days |
| `/news` | GET | Financial news articles (Polygon proxy) | 30 days |
| `/sentiment` | POST | Start sentiment analysis job | - |
| `/sentiment/job/{jobId}` | GET | Check job status | - |
| `/sentiment` | GET | Get sentiment results | 90 days |

**Example requests:**
```bash
# Stock data
GET /stocks?ticker=AAPL&startDate=2025-01-01&type=prices

# News articles
GET /news?ticker=AAPL&from=2025-01-01&to=2025-01-30

# Sentiment analysis
POST /sentiment
Body: {"ticker":"AAPL","startDate":"2025-01-01","endDate":"2025-01-15"}
```

---

## 💻 Tech Stack

* **Runtime:** Node.js 20.x, TypeScript 5
* **Infrastructure:** AWS Lambda + API Gateway HTTP API + DynamoDB
* **Deployment:** AWS SAM (Infrastructure as Code)
* **APIs:** Tiingo (stocks), Polygon (news)
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
| Lambda | ~$0 | Free tier covers most usage |
| API Gateway | ~$1 | HTTP API (cheaper than REST) |
| CloudWatch | ~$1 | Logs + custom metrics |

**Cost optimization:**
- Cache TTL: 7d (stocks), 30d (news), 90d (sentiment)
- Target >80% cache hit rate
- Pay-per-request billing (auto-scales, no idle costs)
- Use `npm run warm-cache` to reduce cold starts

---

## 🔐 Production Checklist

**Pre-Deploy:**
- [ ] Tests pass (`npm test`)
- [ ] TypeScript compiles (`npm run type-check`)
- [ ] AWS credentials configured
- [ ] Tiingo + Polygon API keys ready
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
| "API key not configured" | `sam deploy --parameter-overrides TiingoApiKey="key" PolygonApiKey="key"` |
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
