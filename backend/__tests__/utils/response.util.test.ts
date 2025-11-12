/**
 * Tests for response utilities
 */

import {
  successResponse,
  errorResponse,
  getCorsHeaders,
} from '../../src/utils/response.util';

describe('Response Utilities', () => {
  describe('successResponse', () => {
    it('should create a successful response with default status 200', () => {
      const data = { message: 'Success' };
      const response = successResponse(data);

      expect(response.statusCode).toBe(200);
      expect(response.headers).toHaveProperty('Content-Type', 'application/json');
      expect(response.headers).toHaveProperty('Access-Control-Allow-Origin', '*');
      expect(response.body).toBe(JSON.stringify({ data }));
    });

    it('should create a successful response with custom status code', () => {
      const data = { created: true };
      const response = successResponse(data, 201);

      expect(response.statusCode).toBe(201);
      expect(response.body).toBe(JSON.stringify({ data }));
    });

    it('should include CORS headers', () => {
      const response = successResponse({});

      expect(response.headers).toHaveProperty('Access-Control-Allow-Origin');
      expect(response.headers).toHaveProperty('Access-Control-Allow-Methods');
      expect(response.headers).toHaveProperty('Access-Control-Allow-Headers');
    });

    it('should handle array data', () => {
      const data = [1, 2, 3];
      const response = successResponse(data);

      expect(response.body).toBe(JSON.stringify({ data }));
    });

    it('should handle null data', () => {
      const response = successResponse(null);

      expect(response.body).toBe(JSON.stringify({ data: null }));
    });
  });

  describe('errorResponse', () => {
    it('should create an error response with default status 500', () => {
      const message = 'Something went wrong';
      const response = errorResponse(message);

      expect(response.statusCode).toBe(500);
      expect(response.headers).toHaveProperty('Content-Type', 'application/json');
      expect(response.headers).toHaveProperty('Access-Control-Allow-Origin', '*');
      expect(response.body).toBe(JSON.stringify({ error: message }));
    });

    it('should create an error response with custom status code', () => {
      const message = 'Not found';
      const response = errorResponse(message, 404);

      expect(response.statusCode).toBe(404);
      expect(response.body).toBe(JSON.stringify({ error: message }));
    });

    it('should include CORS headers', () => {
      const response = errorResponse('Error', 400);

      expect(response.headers).toHaveProperty('Access-Control-Allow-Origin');
      expect(response.headers).toHaveProperty('Access-Control-Allow-Methods');
      expect(response.headers).toHaveProperty('Access-Control-Allow-Headers');
    });

    it('should handle various HTTP error codes', () => {
      expect(errorResponse('Bad Request', 400).statusCode).toBe(400);
      expect(errorResponse('Unauthorized', 401).statusCode).toBe(401);
      expect(errorResponse('Forbidden', 403).statusCode).toBe(403);
      expect(errorResponse('Not Found', 404).statusCode).toBe(404);
      expect(errorResponse('Rate Limited', 429).statusCode).toBe(429);
    });
  });

  describe('getCorsHeaders', () => {
    it('should return CORS headers object', () => {
      const headers = getCorsHeaders();

      expect(headers).toHaveProperty('Content-Type');
      expect(headers).toHaveProperty('Access-Control-Allow-Origin');
      expect(headers).toHaveProperty('Access-Control-Allow-Methods');
      expect(headers).toHaveProperty('Access-Control-Allow-Headers');
    });

    it('should return a new copy each time', () => {
      const headers1 = getCorsHeaders();
      const headers2 = getCorsHeaders();

      expect(headers1).not.toBe(headers2);
      expect(headers1).toEqual(headers2);
    });
  });
});
