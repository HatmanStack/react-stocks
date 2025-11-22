import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PredictionRequest, PredictionResponse } from '../types/prediction.types';

/**
 * Handler for the /predict endpoint
 * Triggers the multi-signal prediction pipeline
 */
export async function predictionHandler(
    event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
    console.log('[PredictionHandler] Request received:', event.body);

    try {
        // Parse request
        let request: PredictionRequest;
        try {
            request = JSON.parse(event.body || '{}');
        } catch (e) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Invalid JSON body' })
            };
        }

        // Validate request
        if (!request.ticker || typeof request.ticker !== 'string') {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing or invalid ticker' })
            };
        }

        if (!request.days || typeof request.days !== 'number' || request.days < 30) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Invalid days parameter. Must be at least 30.' })
            };
        }

        // TODO: Implement full prediction pipeline (Tasks 5-11)
        // For now, return a stubbed response to verify connectivity
        const response: PredictionResponse = {
            ticker: request.ticker,
            predictions: {
                nextDay: { direction: 'up', probability: 0.5 },
                twoWeek: { direction: 'up', probability: 0.5 },
                oneMonth: { direction: 'down', probability: 0.5 }
            }
        };

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(response)
        };
    } catch (error) {
        console.error('[PredictionHandler] Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
}
