import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PredictionRequest, PredictionResponse } from '../types/prediction.types';
import { runPredictionPipeline } from '../services/pipeline';

export async function predictionHandler(
    event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
    console.log('[PredictionHandler] Request received:', event.body);

    try {
        // Parse request
        let request: PredictionRequest;
        if (event.body) {
            request = JSON.parse(event.body);
        } else {
             // Handle query params if body missing (optional, but good for testing)
             request = {
                 ticker: event.queryStringParameters?.ticker || '',
                 days: parseInt(event.queryStringParameters?.days || '0', 10)
             };
        }

        // Validate
        if (!request.ticker) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing ticker symbol' })
            };
        }

        if (request.days && request.days < 30) {
             return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Minimum 30 days required for training' })
            };
        }

        // Default days if not provided
        const days = request.days || 90;

        // Run pipeline
        const predictions = await runPredictionPipeline(request.ticker, days);

        // Helper to extract and format prediction
        const getPred = (h: number) => {
            const p = predictions.find(item => item.horizon === h);
            if (p) {
                return {
                    direction: p.direction,
                    probability: p.probability
                };
            }
            return { direction: 'down' as const, probability: 0.5 };
        };

        // Format response
        const response: PredictionResponse = {
            ticker: request.ticker,
            predictions: {
                nextDay: getPred(1),
                twoWeek: getPred(14),
                oneMonth: getPred(30)
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
    } catch (error: any) {
        console.error('[PredictionHandler] Error:', error);

        // Handle known errors
        if (error.message && error.message.includes('Insufficient')) {
             return {
                statusCode: 400,
                body: JSON.stringify({ error: error.message })
            };
        }

        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error', details: error.message })
        };
    }
}
