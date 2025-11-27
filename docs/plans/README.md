# API Gateway Performance & Cost Optimization Plan

## Overview

This plan implements comprehensive performance and cost optimizations for the existing API Gateway v2 HTTP API infrastructure. The project currently uses API Gateway v2 with DynamoDB caching and Lambda functions, and is working well for moderate traffic (100-10K requests/day with market-hour spikes). This optimization plan proactively prepares the infrastructure for growth while reducing operational costs.

**Current Architecture:**
- API Gateway v2 HTTP API with CORS and throttling
- Single Lambda function (1024MB, 60s timeout) handling all endpoints
- DynamoDB caching (7-day TTL) for stocks, news, sentiment
- X-Ray tracing enabled
- 80% cache hit rate threshold

**Optimization Goals:**
1. **Reduce Lambda invocations** through API Gateway response caching
2. **Minimize response latency** through compression and Lambda tuning
3. **Lower DynamoDB costs** through intelligent TTL and access pattern optimization
4. **Eliminate cold starts** during market hours with strategic provisioning
5. **Enable request batching** to reduce frontend round-trips
6. **Implement cache warming** for predictable market-hour traffic

This plan maintains strict test-driven development practices and ensures all changes are validated through comprehensive unit and integration tests with mocking for CI compatibility.

## Prerequisites

### Required Tools
- **AWS CLI** (v2.x) - Configured with credentials (`aws configure`)
- **AWS SAM CLI** (v1.100+) - For local testing and deployment
- **Node.js** (v20.x) - LTS version via nvm
- **npm** (v10.x) - Package manager

### Environment Setup
- Active AWS account with CloudFormation permissions
- Tiingo API key (for stock data)
- Finnhub API key (for news data)
- Existing deployment of react-stocks backend

### Current Stack Resources
- `ReactStocksApi` - API Gateway v2 HTTP API
- `ReactStocksFunction` - Lambda function (all endpoints)
- `StocksCacheTable` - DynamoDB table (stocks)
- `NewsCacheTable` - DynamoDB table (news)
- `SentimentCacheTable` - DynamoDB table (sentiment)
- `SentimentJobsTable` - DynamoDB table (async jobs)

## Phase Summary

| Phase | Goal | Est. Tokens | Deployment Impact |
|-------|------|-------------|-------------------|
| **Phase 0** | Foundation & Architecture | N/A | None - planning only |
| **Phase 1** | Infrastructure Optimizations | ~95,000 | Backend deployment required |
| **Phase 2** | Application Optimizations | ~85,000 | Backend + frontend deployment |

### Phase Breakdown

**Phase 0: Foundation** (This document establishes the "law")
- Architecture Decision Records (ADRs)
- Design patterns and conventions
- Deployment script specifications
- Testing strategy and CI configuration

**Phase 1: Infrastructure Optimizations** (~95,000 tokens)
- API Gateway response caching configuration
- Lambda memory/timeout tuning per endpoint
- DynamoDB TTL optimization by data type
- Response compression (gzip) enablement
- Provisioned concurrency for market hours
- Connection pooling optimization

**Phase 2: Application Optimizations** (~85,000 tokens)
- Request batching endpoint (multi-ticker support)
- Cache warming system (pre-market preparation)
- CloudWatch dashboard for monitoring
- Cost analysis and alerting
- Performance benchmarking suite

## Navigation

- **[Phase 0: Foundation](./Phase-0.md)** - Architecture, patterns, deployment specs
- **[Phase 1: Infrastructure Optimizations](./Phase-1.md)** - API Gateway, Lambda, DynamoDB
- **[Phase 2: Application Optimizations](./Phase-2.md)** - Batching, warming, monitoring

## Token Allocation Strategy

Each phase is designed to fit within a ~100k token context window, allowing an implementation engineer to load the entire phase plan along with relevant source files without exceeding context limits.

**Token Budget Breakdown:**
- Phase 0 (Foundation): Documentation only, no token budget
- Phase 1 (Infrastructure): ~95,000 tokens
  - API Gateway caching: ~15,000 tokens
  - Lambda optimization: ~20,000 tokens
  - DynamoDB optimization: ~15,000 tokens
  - Response compression: ~10,000 tokens
  - Provisioned concurrency: ~20,000 tokens
  - Testing & validation: ~15,000 tokens

- Phase 2 (Application): ~85,000 tokens
  - Request batching: ~25,000 tokens
  - Cache warming: ~25,000 tokens
  - Monitoring dashboard: ~20,000 tokens
  - Benchmarking: ~15,000 tokens

## Development Workflow

Each phase follows this workflow:
1. **Review Phase-0** - Understand patterns, deployment, testing strategy
2. **Read Phase-N** - Load phase plan and prerequisites
3. **Implement Tasks** - Follow TDD, atomic commits, conventional commit format
4. **Verify Phase** - Run test suite, integration tests, deployment validation
5. **Deploy** - Use `npm run deploy` to update infrastructure
6. **Monitor** - Verify metrics, cache hit rates, performance improvements

## Success Metrics

**Performance Improvements:**
- API Gateway cache hit rate: >70% for stable data
- Average response latency: <500ms (p50), <1000ms (p99)
- Cold start frequency: <1% of requests during market hours
- Cache hit rate (DynamoDB): >85% (up from 80%)

**Cost Reductions:**
- Lambda invocations: -40% (API Gateway caching)
- DynamoDB read units: -20% (TTL optimization)
- Data transfer: -30% (compression)
- Total monthly cost: -25-35% reduction

**Reliability:**
- Zero breaking changes during deployment
- 100% backward compatibility with existing frontend
- All tests passing in CI (unit + mocked integration)

---

**Next Steps:** Review [Phase-0: Foundation](./Phase-0.md) to understand architecture decisions and deployment strategy.
