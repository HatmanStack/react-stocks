# Multi-Signal Stock Prediction Model - Implementation Plan

## Feature Overview

This feature replaces the existing bag-of-words prediction model with a sophisticated multi-signal logistic regression system. The new model combines OHLCV price data, event classification, aspect analysis, and DistilFinBERT sentiment scores to predict stock price movements across three time horizons (1-day, 2-week, 1-month). The system leverages Lambda-based asynchronous processing for consistent performance and cross-user caching, following the same architectural patterns established for sentiment analysis.

The model trains on-the-fly using TensorFlow.js for Node.js (@tensorflow/tfjs-node), incorporating 14 features including price metrics, one-hot encoded event types, aggregated aspect scores, sentiment scores, and prediction horizon. Training data is labeled using same-day price movements with a ±1% threshold to filter market noise. The system implements smart refresh logic to minimize compute costs by only recomputing predictions when new news articles are available.

Predictions are displayed as directional indicators (↑/↓) with probability percentages in both the sentiment tab's daily aggregate view and portfolio items, replacing the current percentage return format. The feature maintains backward compatibility during migration and follows strict test-driven development practices throughout implementation.

## Prerequisites

### Environment Requirements
- **Node.js**: v24 LTS (managed via nvm)
- **TypeScript**: 5.x (for Lambda runtime and build)
- **AWS CLI**: Configured with appropriate credentials
- **AWS SAM CLI**: For Lambda deployment
- **Package Managers**: npm (frontend and backend)

### Development Tools
- TypeScript 5.x
- Expo SDK (current project version)
- React Native testing libraries
- Jest test framework
- AWS SDK for JavaScript v3

### External Dependencies
- **Existing Services**: Lambda sentiment service (DistilFinBERT), Aspect score service
- **Database**: SQLite (native), localStorage (web)
- **APIs**: Backend Lambda (Tiingo/Finnhub proxies)
- **ML Library**: scikit-learn 1.3+ (Lambda Python environment)

### Knowledge Prerequisites
- Familiarity with repository pattern (see `src/database/repositories/`)
- Understanding of React Query caching patterns
- Experience with SAM template configuration
- Async polling patterns (reference: `src/services/api/lambdaSentiment.service.ts`)

## Phase Summary

| Phase | Goal | Estimated Tokens | Status |
|-------|------|-----------------|--------|
| **Phase 0** | Architecture & Foundation | N/A (Reference) | 📋 Pending |
| **Phase 1** | Backend Infrastructure & ML Model | ~101,000 | 📋 Pending |
| **Phase 2** | Deployment & Frontend Integration | ~104,000 | 📋 Pending |

### Phase Breakdown

**Phase 0: Architecture & Foundation** (see [Phase-0.md](./Phase-0.md))
- Architecture Decision Records (ADRs)
- Tech stack and design rationale
- Deployment script specifications
- Testing strategy and mocking approach
- Shared patterns and conventions

**Phase 1: Backend Infrastructure & ML Model** (see [Phase-1.md](./Phase-1.md))
- Database schema migrations (4 new fields + prediction format updates)
- Repository pattern updates for new schema
- Lambda function structure and data fetching layer
- Feature engineering with materiality-weighted aggregation
- Logistic regression implementation with on-the-fly training
- Comprehensive unit testing

**Phase 2: Deployment & Frontend Integration** (see [Phase-2.md](./Phase-2.md))
- API Gateway configuration and async job processing
- SAM template and deployment automation
- Frontend API client with polling mechanism
- Sync orchestration and smart refresh logic
- UI updates (sentiment tab + portfolio)
- Integration tests and end-to-end verification

## Navigation

- **[Phase 0: Architecture & Foundation](./Phase-0.md)** - Start here to understand design decisions
- **[Phase 1: Backend Infrastructure & ML Model](./Phase-1.md)** - Database and Lambda ML implementation
- **[Phase 2: Deployment & Frontend Integration](./Phase-2.md)** - API, frontend, and UI completion

## Development Workflow

1. **Read Phase 0** completely to understand architecture decisions
2. **Execute Phase 1** sequentially, following TDD practices
3. **Verify Phase 1** completion via test suite before proceeding
4. **Execute Phase 2** with integration focus
5. **Final verification** using end-to-end tests

## Branch Strategy

This plan is branch-agnostic. Create feature branches as needed following project conventions. All phases should be implemented with atomic commits using conventional commit format.

## Testing Strategy Overview

- **Unit Tests**: Every function, repository, and service method
- **Integration Tests**: Mocked Lambda responses, no live AWS dependencies
- **CI Compatibility**: All tests must pass in isolated CI environment (GitHub Actions)
- **E2E Tests**: Local verification only, not required for CI

## Success Criteria

- [ ] All Phase 1 tasks complete with passing tests
- [ ] All Phase 2 tasks complete with passing tests
- [ ] CI pipeline passes (lint + unit tests + mocked integration tests)
- [ ] Local deployment successful via `npm run deploy`
- [ ] UI displays predictions in sentiment tab and portfolio
- [ ] Smart refresh logic prevents unnecessary recomputation
- [ ] Predictions match expected format (↑ 72% or ↓ 38%)
- [ ] Legacy bag-of-words code removed

## Token Budget Management

Each phase is designed to fit within a ~100k token context window for efficient implementation. If context becomes constrained, prioritize:

1. Core implementation guidance
2. Test specifications
3. Verification criteria
4. Architectural patterns

Detailed code examples are intentionally minimal - engineers should reference existing patterns in the codebase.
