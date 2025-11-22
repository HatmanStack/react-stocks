import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { APIGatewayResponse } from '../utils/response.util';
import { PredictionRequest, PredictionResponse } from '../types/prediction.types';
import { runPredictionPipeline } from '../services/pipeline';

const RESPONSE_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
};

export async function predictionHandler(
    event: APIGatewayProxyEventV2
): Promise<APIGatewayResponse> {
    console.log('[PredictionHandler] Request received:', event.body);

    try {
        // Parse request
        let request: PredictionRequest;
        if (event.body) {
            try {
                request = JSON.parse(event.body);
            } catch (parseError) {
                return {
                    statusCode: 400,
                    headers: RESPONSE_HEADERS,
                    body: JSON.stringify({ error: 'Invalid JSON in request body' })
                };
            }
        } else {
             // Handle query params if body missing (optional, but good for testing)
             const daysParam = event.queryStringParameters?.days;
             const parsedDays = daysParam ? Number(daysParam) : 0;

             request = {
                 ticker: event.queryStringParameters?.ticker || '',
                 days: parsedDays
             };
        }

        // Validate ticker
        if (!request.ticker || typeof request.ticker !== 'string') {
            return {
                statusCode: 400,
                headers: RESPONSE_HEADERS,
                body: JSON.stringify({ error: 'Missing or invalid ticker symbol' })
            };
        }

        // Validate days parameter
        const parsedDays = Number(request.days);
        if (request.days !== undefined && (!Number.isFinite(parsedDays) || parsedDays < 30)) {
             return {
                statusCode: 400,
                headers: RESPONSE_HEADERS,
                body: JSON.stringify({ error: 'Days parameter must be a number >= 30' })
            };
        }

        // Default days if not provided or use parsed value
        const days = Number.isFinite(parsedDays) && parsedDays >= 30 ? parsedDays : 90;

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
            headers: RESPONSE_HEADERS,
            body: JSON.stringify(response)
        };
    } catch (error: any) {
        console.error('[PredictionHandler] Error:', error);

        // Handle known errors
        if (error.message && error.message.includes('Insufficient')) {
             return {
                statusCode: 400,
                headers: RESPONSE_HEADERS,
                body: JSON.stringify({ error: error.message })
            };
        }

        return {
            statusCode: 500,
            headers: RESPONSE_HEADERS,
            body: JSON.stringify({ error: 'Internal server error', details: error.message })
        };
    }
}
