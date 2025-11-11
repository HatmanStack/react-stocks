# React Stocks Backend

AWS Lambda backend for React Stocks application. Provides secure API proxying for Tiingo (stock prices) and Polygon (news) APIs, protecting API keys from client-side exposure.

## Architecture

- **Runtime**: Node.js 20.x
- **Language**: TypeScript 5.x
- **Infrastructure**: AWS Lambda + API Gateway HTTP API
- **Deployment**: AWS SAM CLI

## Project Structure

```
backend/
├── src/
│   ├── handlers/          # Route handlers (stocks, news)
│   ├── services/          # API clients (Tiingo, Polygon)
│   ├── utils/             # Helper functions
│   ├── types/             # TypeScript type definitions
│   └── index.ts           # Lambda entry point
├── __tests__/             # Unit and integration tests
├── template.yaml          # SAM CloudFormation template
├── samconfig.toml         # SAM deployment configuration
└── package.json
```

## Development

### Prerequisites

- Node.js 18+ (project uses v24 LTS)
- AWS CLI configured with credentials
- AWS SAM CLI (v1.70.0+)

Run prerequisite validation:
```bash
npm run validate
```

### Installation

```bash
cd backend
npm install
```

### Build

```bash
npm run build          # Compile TypeScript to dist/
npm run build:watch    # Watch mode for development
```

### Testing

```bash
npm test               # Run tests once
npm run test:watch     # Watch mode
npm run test:coverage  # Generate coverage report
```

Coverage target: >80% for all metrics (branches, functions, lines, statements)

### Local Development

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions (to be added in Task 1.8).

## API Endpoints

After deployment via SAM, the API Gateway provides:

- `GET /stocks` - Proxy for Tiingo stock prices and metadata
  - Query params: `ticker`, `startDate`, `endDate` (optional), `type` (optional)
- `GET /news` - Proxy for Polygon news articles
  - Query params: `ticker`, `startDate` (optional), `endDate` (optional), `limit` (optional)

## Environment Variables

Required for Lambda deployment:

- `TIINGO_API_KEY` - Tiingo API key
- `POLYGON_API_KEY` - Polygon API key

These are configured via SAM template parameters during deployment.

## Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm test` - Run test suite
- `npm run clean` - Remove build artifacts

## Security

- API keys stored as encrypted Lambda environment variables
- CORS enabled for frontend origins
- Input validation on all routes
- Minimal IAM permissions (CloudWatch Logs only)

## License

MIT
