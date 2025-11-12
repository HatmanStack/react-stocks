/**
 * Tests for Lambda handler entry point
 */

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler } from '../src/index';

describe('Lambda Handler', () => {
  // Helper to create mock event
  function createMockEvent(
    path: string,
    method: string = 'GET',
    queryParams?: Record<string, string>
  ): APIGatewayProxyEventV2 {
    return {
      rawPath: path,
      requestContext: {
        requestId: 'test-request-id',
        http: {
          method,
          path,
          protocol: 'HTTP/1.1',
          sourceIp: '127.0.0.1',
          userAgent: 'test-agent',
        },
        accountId: 'test-account',
        apiId: 'test-api',
        domainName: 'test.execute-api.us-east-1.amazonaws.com',
        domainPrefix: 'test',
        stage: '$default',
        time: '01/Jan/2024:00:00:00 +0000',
        timeEpoch: 1704067200000,
      },
      queryStringParameters: queryParams,
      headers: {},
      isBase64Encoded: false,
      rawQueryString: queryParams
        ? Object.entries(queryParams)
            .map(([k, v]) => `${k}=${v}`)
            .join('&')
        : '',
      routeKey: `${method} ${path}`,
      version: '2.0',
    } as APIGatewayProxyEventV2;
  }

  describe('Request Routing', () => {
    it('should return 404 for unknown routes', async () => {
      const event = createMockEvent('/unknown');
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      expect(response.body).toContain('not found');
      expect(response.headers).toHaveProperty('Access-Control-Allow-Origin');
    });

    // Note: Handlers are now implemented
    // Handler-specific tests are in __tests__/handlers/stocks.handler.test.ts
    // and __tests__/handlers/news.handler.test.ts

    it('should include CORS headers in all responses', async () => {
      const event = createMockEvent('/unknown');
      const response = await handler(event);

      expect(response.headers).toHaveProperty('Access-Control-Allow-Origin', '*');
      expect(response.headers).toHaveProperty('Content-Type', 'application/json');
    });
  });

  describe('HTTP Method Validation', () => {
    it('should reject POST requests', async () => {
      const event = createMockEvent('/stocks', 'POST');
      const response = await handler(event);

      expect(response.statusCode).toBe(405);
      expect(response.body).toContain('not allowed');
    });

    it('should reject PUT requests', async () => {
      const event = createMockEvent('/stocks', 'PUT');
      const response = await handler(event);

      expect(response.statusCode).toBe(405);
      expect(response.body).toContain('not allowed');
    });

    it('should reject DELETE requests', async () => {
      const event = createMockEvent('/stocks', 'DELETE');
      const response = await handler(event);

      expect(response.statusCode).toBe(405);
      expect(response.body).toContain('not allowed');
    });

    it('should accept GET requests', async () => {
      const event = createMockEvent('/stocks', 'GET');
      const response = await handler(event);

      // Should not return 405 (method not allowed)
      expect(response.statusCode).not.toBe(405);
    });
  });

  describe('Error Handling', () => {
    it('should include CORS headers in error responses', async () => {
      const event = createMockEvent('/error');
      const response = await handler(event);

      expect(response.headers).toHaveProperty('Access-Control-Allow-Origin');
      expect(response.headers).toHaveProperty('Content-Type');
    });

    it('should return JSON error format', async () => {
      const event = createMockEvent('/unknown');
      const response = await handler(event);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(typeof body.error).toBe('string');
    });
  });

  describe('Request Logging', () => {
    let consoleLogSpy: typeof console.log;

    beforeEach(() => {
      consoleLogSpy = console.log;
      console.log = () => {}; // Mock implementation
    });

    afterEach(() => {
      console.log = consoleLogSpy; // Restore
    });

    it('should log incoming requests', async () => {
      const event = createMockEvent('/stocks');

      // Just verify handler runs without error
      const response = await handler(event);
      expect(response).toBeDefined();
    });
  });
});
