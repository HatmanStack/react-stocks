# Architecture Refinement Plan

This plan addresses five findings from a code audit, refining the React Stocks monorepo for maintainability, operational resilience, and architectural clarity. The work consolidates 7 DynamoDB tables into a true single-table design, centralizes undocumented magic numbers into typed constant modules with derivation comments, persists circuit breaker state to DynamoDB to survive Lambda cold starts, and adds inline documentation explaining intentional security decisions (no-auth, CORS parameterization).

The single-table migration is the largest change. It redesigns the DynamoDB key schema using composite keys (PK: `ENTITY#ticker`, SK: `TYPE#sortValue`) to unify all access patterns into one table while preserving TTL behavior per entity type. All backend repositories are refactored to use the new key structure, and the SAM template is reduced from 7 table resources to 1.

GraphQL/AppSync is noted as a future direction but is explicitly out of scope for this plan.

## Prerequisites

- Node.js v24 LTS (via nvm)
- Python 3.13 (via uv)
- AWS SAM CLI installed
- Existing test suites passing (`npm run check`)

## Important

Commit messages should NOT include `Co-Authored-By` or `Generated with` attribution lines.

## Phase Summary

| Phase | Goal | Estimated Tokens |
|-------|------|-----------------|
| [Phase 0](./Phase-0.md) | Foundation: ADRs, conventions, testing strategy | N/A (reference doc) |
| [Phase 1](./Phase-1.md) | Documentation fixes + magic numbers centralization | ~25,000 |
| [Phase 2](./Phase-2.md) | DynamoDB single-table migration + circuit breaker persistence | ~50,000 |
