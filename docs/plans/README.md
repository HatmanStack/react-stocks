# Code Hygiene Audit

## Overview

This plan implements a comprehensive code hygiene audit across the React Stocks monorepo. The audit identifies and removes dead code, unused imports, and runtime inefficiencies that waste resources and degrade performance.

The recent discovery of a critical inefficiency—30 redundant Finnhub API calls per sentiment data fetch—revealed that legacy fallback patterns were silently consuming rate limits and degrading UX. This audit systematically identifies similar issues across the entire codebase using static analysis tools (knip for TypeScript, vulture for Python) combined with manual runtime pattern analysis.

Key deliverables:
- Automated bash script for dead code detection
- Removal of unused imports and unreachable code
- Identification of API call inefficiencies and heavy import patterns
- Clean codebase with no orphaned logic

## Prerequisites

- Node.js 24.x (for knip)
- Python 3.13 with uv (for vulture)
- Access to full codebase (frontend + backend)
- Understanding of the monorepo structure

**Tools to Install:**
```bash
# TypeScript dead code detection
npm install -D knip

# Python dead code detection
uv pip install vulture
```

## Phase Summary

| Phase | Goal | Estimated Tokens |
|-------|------|------------------|
| 0 | Foundation: Tools setup, analysis patterns, audit methodology | ~10,000 |
| 1 | Implementation: Run audits, fix issues, create automation script | ~40,000 |

## Navigation

- [Phase-0.md](./Phase-0.md) - Foundation (tools, methodology, patterns)
- [Phase-1.md](./Phase-1.md) - Implementation (all tasks)

## Commit Guidelines

**Important**: Do NOT include `Co-Authored-By`, `Generated-By`, or similar attribution lines in commit messages.

**Author & Committer:**
- Name: HatmanStack
- Email: 82614182+HatmanStack@users.noreply.github.com

**Format:**
```
type(scope): brief description

Detail 1
Detail 2
```

## Scope

**Included:**
- Frontend TypeScript/TSX (React Native/Expo)
- Backend TypeScript (Node.js Lambda)
- Backend Python (yfinance Lambda)
- Test files
- Scripts and configuration

**Excluded:**
- node_modules, dist, coverage directories
- Generated files (.expo, .next)
- CI/CD pipeline modifications (per user request)

## Aggression Level: Conservative

- Remove dead code and unused imports only
- Preserve all comments and docstrings
- Do not refactor for style/performance unless directly related to dead code
