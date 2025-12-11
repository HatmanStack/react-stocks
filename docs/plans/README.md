# Replace Tiingo with yfinance

## Overview

This plan migrates the stock data provider from Tiingo API to yfinance (Python library) to improve reliability. The current Tiingo integration has been unreliable, causing service disruptions.

The migration replaces the Node.js Tiingo service with a Python 3.13 Lambda function using yfinance. All existing endpoints (`/stocks`, `/search`, `/batch/stocks`) will be handled by the new Python Lambda. The response format remains identical to the current Tiingo format, ensuring zero frontend changes.

Key architectural changes:
- New Python Lambda replaces Node.js stock handlers
- yfinance library for stock prices, metadata, and search
- Simplified DynamoDB caching (remove cache warming complexity)
- Data transformation layer maps yfinance data to existing Tiingo response format

## Prerequisites

- Python 3.13 runtime (AWS Lambda supports via custom runtime or container)
- AWS SAM CLI for deployment
- yfinance library (`pip install yfinance`)
- boto3 for DynamoDB access
- Existing DynamoDB tables remain unchanged

## Phase Summary

| Phase | Goal | Estimated Tokens |
|-------|------|------------------|
| 0 | Foundation: Architecture decisions, testing strategy, deploy script updates | ~15,000 |
| 1 | Implementation: Python Lambda, handlers, caching, data transforms, cleanup | ~85,000 |

## Navigation

- [Phase-0.md](./Phase-0.md) - Foundation (ADRs, patterns, testing strategy)
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
