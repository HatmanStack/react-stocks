# Hybrid Caching Architecture - Implementation Plan

## Feature Overview

This feature implements a hybrid caching architecture that eliminates redundant API calls and sentiment computation across multiple users while maintaining offline-first capabilities. The system will use DynamoDB as a shared cache layer between users, with Lambda performing compute-intensive sentiment analysis asynchronously.

**Current Pain Points:**
- Sentiment processing hangs the UI (45+ seconds for 30-day range)
- Every user computes sentiment for the same articles repeatedly
- Sequential date processing with no async yielding blocks the main thread
- Redundant API calls to Tiingo/Finnhub for identical data across users

**Solution Architecture:**
1. **DynamoDB Shared Cache**: Store stock prices, news articles, and sentiment analysis results
2. **Three-Tier Lookup**: Check local SQLite → Check DynamoDB → Compute in Lambda
3. **Async Sentiment Processing**: Return prices/news immediately, process sentiment in background
4. **Progressive Loading**: Display price/news tabs instantly, show spinner on sentiment tab while processing
5. **Offline-First Preservation**: Local database remains authoritative, DynamoDB is a performance enhancement

## Prerequisites

Before starting implementation:

**AWS Account & Permissions:**
- AWS account with CloudFormation/SAM deployment permissions
- IAM permissions to create DynamoDB tables, Lambda functions, and IAM roles
- AWS CLI configured with appropriate credentials (`aws configure`)
- SAM CLI installed (`sam --version` should show ≥1.100.0)

**Development Environment:**
- Node.js v20 LTS (current backend runtime)
- TypeScript 5.x
- Existing backend deployed (Lambda + API Gateway functional)
- Environment variable `EXPO_PUBLIC_BACKEND_URL` set correctly

**Codebase State:**
- All existing tests passing (`npm test` in root and `backend/`)
- Git working directory clean or changes committed
- Current sync flow functional (syncOrchestrator working)

**Testing Tools:**
- AWS DynamoDB Local (optional but recommended for local testing)
- Postman or similar for API endpoint testing
- React Native Debugger or Expo DevTools for frontend testing

## Phase Summary

| Phase | Goal | Key Deliverables | Est. Tokens |
|-------|------|-----------------|-------------|
| **Phase 0** | Architecture & Design | ADRs, DynamoDB schema design, async patterns | ~8,000 |
| **Phase 1** | DynamoDB Foundation | 3 DynamoDB tables, IAM roles, base repositories | ~35,000 |
| **Phase 2** | Lambda Caching Layer | Cache-aware endpoints for stocks & news | ~40,000 |
| **Phase 3** | Async Sentiment Processing | Background sentiment Lambda, job tracking | ~45,000 |
| **Phase 4** | Frontend Async Loading | Progressive UI, polling, spinner states | ~35,000 |
| **Phase 5** | Migration & Optimization | Data migration, performance tuning, cleanup | ~25,000 |
| **Total** | | **Full hybrid caching system** | **~188,000** |

## Navigation

- **[Phase 0: Foundation](./Phase-0.md)** - Architecture decisions and design patterns
- **[Phase 1: DynamoDB Foundation](./Phase-1.md)** - Database setup and base infrastructure
- **[Phase 2: Lambda Caching Layer](./Phase-2.md)** - Stock and news caching endpoints
- **[Phase 3: Async Sentiment Processing](./Phase-3.md)** - Background sentiment analysis
- **[Phase 4: Frontend Async Loading](./Phase-4.md)** - Progressive UI and polling
- **[Phase 5: Migration & Optimization](./Phase-5.md)** - Production readiness

## Development Workflow

Each phase follows this pattern:

1. **Read the phase file completely** before starting any task
2. **Verify prerequisites** are met (previous phases complete, dependencies installed)
3. **Follow TDD**: Write tests first, then implementation
4. **Commit frequently**: After each task completion with conventional commit messages
5. **Verify before proceeding**: Run verification checklist at end of each task
6. **Document blockers**: If stuck, document the issue and context before asking for help

## Testing Strategy

- **Unit Tests**: Each repository, service, and utility function
- **Integration Tests**: End-to-end flows (Lambda → DynamoDB → Frontend)
- **Performance Tests**: Measure latency improvements vs current architecture
- **Backward Compatibility**: Ensure offline mode still works when Lambda unavailable

## Success Criteria

✅ **Performance**: Sentiment tab loads in <3 seconds (vs current 45+ seconds)
✅ **Deduplication**: 90%+ cache hit rate for popular stocks across users
✅ **Availability**: System gracefully degrades when Lambda/DynamoDB unavailable
✅ **Offline Support**: Local-first architecture preserved
✅ **Cost Efficiency**: AWS costs <$20/month for 100 active users

## Post-Implementation

After Phase 5 completion:

1. Monitor CloudWatch metrics for Lambda execution times and DynamoDB throughput
2. Set up billing alerts for DynamoDB and Lambda costs
3. Collect user feedback on load times and UI responsiveness
4. Plan Phase 6 (optional): WebSocket for real-time sentiment updates
5. Deprecate old browser-based sentiment analysis code

---

**Ready to begin?** Start with **[Phase 0: Foundation](./Phase-0.md)**
