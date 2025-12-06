/**
 * Integration tests for deployed backend API
 *
 * These tests require:
 * - Backend deployed to AWS
 * - API_GATEWAY_URL environment variable set
 * - Valid Tiingo and Polygon API keys configured in Lambda
 *
 * Run with: npm run test:integration
 */

import { describe, it, expect, beforeAll } from '@jest/globals';

const API_BASE_URL = process.env.API_GATEWAY_URL;

const describeIfDeployed = API_BASE_URL ? describe : describe.skip;

/** Helper to build URL with query params */
function buildUrl(path: string, params?: Record<string, string>): string {
  const url = new URL(path, API_BASE_URL);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }
  return url.toString();
}

describeIfDeployed('Backend API Integration Tests', () => {
  beforeAll(() => {
    if (!API_BASE_URL) {
      console.warn(
        'Skipping integration tests: API_GATEWAY_URL environment variable not set. ' +
        'Deploy the backend first and set API_GATEWAY_URL to the API Gateway endpoint.'
      );
    }
  });

  describe('Stocks Endpoint', () => {
    it('should fetch stock prices successfully', async () => {
      const url = buildUrl('/stocks', {
        ticker: 'AAPL',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });
      const response = await fetch(url);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('data');
      expect(Array.isArray(data.data)).toBe(true);
    }, 10000);

    it('should fetch symbol metadata successfully', async () => {
      const url = buildUrl('/stocks', {
        ticker: 'AAPL',
        type: 'metadata',
      });
      const response = await fetch(url);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('data');
      expect(data.data).toHaveProperty('ticker');
      expect(data.data).toHaveProperty('name');
    }, 10000);

    it('should return 400 for missing ticker', async () => {
      const url = buildUrl('/stocks', { startDate: '2024-01-01' });
      const response = await fetch(url);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('ticker');
    }, 10000);

    it('should return 400 for invalid date format', async () => {
      const url = buildUrl('/stocks', {
        ticker: 'AAPL',
        startDate: '2024/01/01', // Invalid format
      });
      const response = await fetch(url);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('startDate');
    }, 10000);
  });

  describe('News Endpoint', () => {
    it('should fetch news successfully', async () => {
      const url = buildUrl('/news', {
        ticker: 'AAPL',
        from: '2024-01-01',
        to: '2024-01-31',
      });
      const response = await fetch(url);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('data');
      expect(Array.isArray(data.data)).toBe(true);
    }, 30000);

    it('should return 400 for missing ticker', async () => {
      const url = buildUrl('/news');
      const response = await fetch(url);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBeDefined();
    }, 10000);
  });

  describe('CORS and Headers', () => {
    it('should include CORS headers', async () => {
      const url = buildUrl('/stocks', {
        ticker: 'AAPL',
        startDate: '2024-01-01',
      });
      const response = await fetch(url);

      expect(response.headers.get('access-control-allow-origin')).toBeDefined();
    }, 10000);
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const url = buildUrl('/unknown-route');
      const response = await fetch(url);

      expect(response.status).toBe(404);
    }, 10000);

    it('should return 404 or 405 for POST to GET-only endpoint', async () => {
      const url = buildUrl('/stocks');
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: 'AAPL' }),
      });

      // API Gateway returns 404 for method mismatch on HTTP APIs
      expect([404, 405]).toContain(response.status);
    }, 10000);
  });
});
