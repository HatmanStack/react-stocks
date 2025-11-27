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
import axios from 'axios';

const API_BASE_URL = process.env.API_GATEWAY_URL;

const describeIfDeployed = API_BASE_URL ? describe : describe.skip;

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
      const response = await axios.get(`${API_BASE_URL}/stocks`, {
        params: {
          ticker: 'AAPL',
          startDate: '2024-01-01',
          endDate: '2024-01-31',
        },
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('data');
      expect(Array.isArray(response.data.data)).toBe(true);
    }, 10000); // 10 second timeout for API calls

    it('should fetch symbol metadata successfully', async () => {
      const response = await axios.get(`${API_BASE_URL}/stocks`, {
        params: {
          ticker: 'AAPL',
          type: 'metadata',
        },
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('data');
      expect(response.data.data).toHaveProperty('ticker');
      expect(response.data.data).toHaveProperty('name');
    }, 10000);

    it('should return 400 for missing ticker', async () => {
      try {
        await axios.get(`${API_BASE_URL}/stocks`, {
          params: {
            startDate: '2024-01-01',
          },
        });
        throw new Error('Expected request to fail');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error).toContain('ticker');
      }
    }, 10000);

    it('should return 400 for invalid date format', async () => {
      try {
        await axios.get(`${API_BASE_URL}/stocks`, {
          params: {
            ticker: 'AAPL',
            startDate: '2024/01/01', // Invalid format
          },
        });
        throw new Error('Expected request to fail');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error).toContain('startDate');
      }
    }, 10000);
  });

  describe('News Endpoint', () => {
    it('should fetch news successfully', async () => {
      const response = await axios.get(`${API_BASE_URL}/news`, {
        params: {
          ticker: 'AAPL',
          limit: 10,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('data');
      expect(Array.isArray(response.data.data)).toBe(true);
    }, 30000); // 30 second timeout for news (can be slow)

    it('should return 400 for missing ticker', async () => {
      try {
        await axios.get(`${API_BASE_URL}/news`);
        throw new Error('Expected request to fail');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error).toContain('ticker');
      }
    }, 10000);
  });

  describe('CORS and Headers', () => {
    it('should include CORS headers', async () => {
      const response = await axios.get(`${API_BASE_URL}/stocks`, {
        params: {
          ticker: 'AAPL',
          startDate: '2024-01-01',
        },
      });

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    }, 10000);
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      try {
        await axios.get(`${API_BASE_URL}/unknown-route`);
        throw new Error('Expected request to fail');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
      }
    }, 10000);

    it('should return 405 for non-GET methods', async () => {
      try {
        await axios.post(`${API_BASE_URL}/stocks`, {
          ticker: 'AAPL',
        });
        throw new Error('Expected request to fail');
      } catch (error: any) {
        expect(error.response.status).toBe(405);
      }
    }, 10000);
  });
});
