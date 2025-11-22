/**
 * Event Classification Handler
 *
 * Standalone HTTP handler for event classification testing and debugging.
 * Provides batch classification endpoint for up to 100 articles.
 */

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { classifyEvent } from '../services/eventClassification.service.js';
import type { NewsArticle } from '../repositories/newsCache.repository.js';
import type { EventClassificationResult } from '../types/event.types.js';
import { successResponse, errorResponse, type APIGatewayResponse } from '../utils/response.util.js';

/**
 * Request body interface
 */
interface EventClassificationRequest {
  articles: NewsArticle[];
}

/**
 * Response body interface
 */
interface EventClassificationResponse {
  classifications: (EventClassificationResult & { articleUrl: string })[];
  processingTimeMs: number;
}

/**
 * Maximum batch size to prevent timeouts
 */
const MAX_BATCH_SIZE = 100;

/**
 * POST /events/classify - Classify batch of articles
 *
 * Request body: { articles: NewsArticle[] }
 * Response: { classifications: EventClassificationResult[], processingTimeMs: number }
 *
 * @param event - API Gateway event
 * @returns API Gateway response
 */
export async function handleEventClassification(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayResponse> {
  const startTime = Date.now();

  try {
    // Parse and validate request body
    if (!event.body) {
      return errorResponse('Request body is required', 400);
    }

    let body: Partial<EventClassificationRequest>;
    try {
      body = JSON.parse(event.body);
    } catch {
      return errorResponse('Invalid JSON in request body', 400);
    }

    // Validate articles array
    if (!body.articles || !Array.isArray(body.articles)) {
      return errorResponse('Missing or invalid "articles" field. Must be an array.', 400);
    }

    if (body.articles.length === 0) {
      return errorResponse('Articles array cannot be empty', 400);
    }

    if (body.articles.length > MAX_BATCH_SIZE) {
      return errorResponse(
        `Batch size exceeds maximum of ${MAX_BATCH_SIZE} articles`,
        400
      );
    }

    // Validate article structure
    for (let i = 0; i < body.articles.length; i++) {
      const article = body.articles[i];

      if (!article.title && !article.description) {
        return errorResponse(
          `Article at index ${i} must have at least a title or description`,
          400
        );
      }

      if (!article.url) {
        return errorResponse(
          `Article at index ${i} is missing required field: url`,
          400
        );
      }

      if (!article.date) {
        return errorResponse(
          `Article at index ${i} is missing required field: date`,
          400
        );
      }
    }

    // Classify articles in parallel
    const classificationPromises = body.articles.map(async (article) => {
      try {
        const result = await classifyEvent(article);

        return {
          ...result,
          articleUrl: article.url,
        };
      } catch (error) {
        console.error('[EventsHandler] Classification error:', {
          articleUrl: article.url,
          error: error instanceof Error ? error.message : String(error),
        });

        // Return GENERAL classification for failed articles
        return {
          eventType: 'GENERAL' as const,
          confidence: 0,
          matchedKeywords: [],
          articleUrl: article.url,
        };
      }
    });

    const classifications = await Promise.all(classificationPromises);

    const processingTimeMs = Date.now() - startTime;

    // Log summary
    console.log('[EventsHandler] Batch classification complete:', {
      articleCount: body.articles.length,
      processingTimeMs,
      eventTypeDistribution: classifications.reduce((acc, c) => {
        acc[c.eventType] = (acc[c.eventType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    });

    const response: EventClassificationResponse = {
      classifications,
      processingTimeMs,
    };

    return successResponse(response);
  } catch (error) {
    console.error('[EventsHandler] Unexpected error:', error);

    return errorResponse(
      `Internal server error: ${error instanceof Error ? error.message : String(error)}`,
      500
    );
  }
}
