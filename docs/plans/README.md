# Enhanced Sentiment Analysis System - Implementation Plan

## Overview

This implementation plan details the development of a sophisticated multi-signal sentiment analysis system designed to improve trading signal accuracy for stock price predictions. The system replaces the current simple bag-of-words approach with a three-tiered analysis framework that provides multiple independent signals for the multivariate logistic regression prediction model.

The new system classifies financial news articles by event type (Earnings, M&A, Product Launch, etc.), performs aspect-based analysis to extract directional signals from key financial metrics (revenue, EPS, guidance), and applies DistilFinBERT contextual sentiment analysis to material events. These three signals—event classification, aspect score, and DistilFinBERT sentiment—combine with existing price and volume data to create more accurate stock movement predictions.

This architecture balances accuracy and performance by using sophisticated models (DistilFinBERT) only for material events while maintaining fast bag-of-words processing for general news. The result is a system optimized for trading signals where direction accuracy is paramount.

## Prerequisites

### Environment & Tools
- Node.js 20+ with TypeScript 5.6+
- AWS Lambda + DynamoDB (backend infrastructure)
- Python 3.9+ (for DistilFinBERT service)
- Docker (for containerizing DistilFinBERT service)
- Jest testing framework
- Git with conventional commits

### Dependencies to Install
```bash
# Backend Lambda
cd backend
npm install transformers @xenova/transformers  # For DistilFinBERT integration
npm install --save-dev @types/jest

# DistilFinBERT Service (Python)
pip install transformers torch fastapi uvicorn
```

### External Services
- AWS Lambda + DynamoDB (existing)
- DistilFinBERT model deployment (Phase 3)
- Finnhub API (existing)

## Phase Summary

| Phase | Goal | Est. Tokens |
|-------|------|-------------|
| [Phase 0](./Phase-0.md) | Architecture & Design Foundation | N/A |
| [Phase 1](./Phase-1.md) | Event Classification System | ~95,000 |
| [Phase 2](./Phase-2.md) | Aspect-Based Analysis System | ~85,000 |
| [Phase 3](./Phase-3.md) | DistilFinBERT Integration | ~90,000 |
| [Phase 4](./Phase-4.md) | Data Schema & Storage Updates | ~75,000 |
| [Phase 5](./Phase-5.md) | API Integration & Frontend Display | ~95,000 |

**Total Estimated Tokens:** ~440,000 across 5 phases

## Navigation

- **[Phase 0: Architecture & Design](./Phase-0.md)** - Start here for architectural decisions and shared patterns
- **[Phase 1: Event Classification](./Phase-1.md)** - Build the event type classifier
- **[Phase 2: Aspect Analysis](./Phase-2.md)** - Implement aspect-based scoring system
- **[Phase 3: DistilFinBERT](./Phase-3.md)** - Deploy and integrate transformer model
- **[Phase 4: Data Schema](./Phase-4.md)** - Update storage and caching
- **[Phase 5: API & Frontend](./Phase-5.md)** - Expose new signals and update UI

## Development Workflow

Each phase follows this pattern:
1. Read Phase-0.md for architectural context
2. Complete tasks in sequential order
3. Run verification checklist after each task
4. Commit with provided template after each task
5. Verify entire phase before moving to next

## Questions or Issues?

If you encounter ambiguities during implementation, refer back to Phase-0.md for design rationale. Do not deviate from the plan without consultation.
