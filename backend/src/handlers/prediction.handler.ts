import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { APIGatewayResponse, getCorsHeaders } from '../utils/response.util';
import { PredictionRequest, PredictionResponse } from '../types/prediction.types';
import { runPredictionPipeline } from '../services/pipeline';
import { putDailyAggregate, getDailyAggregate } from '../repositories/dailySentimentAggregate.repository';
import { DailySentimentAggregateItem } from '../types/dynamodb.types';

/** Direct Lambda invocation payload (not from API Gateway) */
interface DirectInvocationEvent {
    ticker: string;
    days?: number;
}

/** Type guard for API Gateway events */
function isAPIGatewayEvent(event: unknown): event is APIGatewayProxyEventV2 {
    return typeof event === 'object' && event !== null && 'requestContext' in event;
}

/** Type guard for direct invocation events */
function isDirectInvocation(event: unknown): event is DirectInvocationEvent {
    return typeof event === 'object' && event !== null && 'ticker' in event && !('requestContext' in event);
}

export async function predictionHandler(
    event: APIGatewayProxyEventV2 | DirectInvocationEvent
): Promise<APIGatewayResponse> {
    console.log('[PredictionHandler] Request received. Event type:', typeof event);

    try {
        // Parse request
        let request: PredictionRequest;

        // Case 1: API Gateway Event with body
        if (isAPIGatewayEvent(event) && event.body) {
            try {
                request = JSON.parse(event.body);
            } catch {
                return {
                    statusCode: 400,
                    headers: getCorsHeaders(),
                    body: JSON.stringify({ error: 'Invalid JSON in request body' })
                };
            }
        }
        // Case 2: Direct Lambda Invocation (event is the payload)
        else if (isDirectInvocation(event)) {
             console.log('[PredictionHandler] Direct Lambda invocation detected');
             request = {
                 ticker: event.ticker,
                 days: event.days || 90
             };
        }
        // Case 3: API Gateway GET Request (Query Parameters)
        else if (isAPIGatewayEvent(event)) {
             // Handle query params if body missing (optional, but good for testing)
             const daysParam = event.queryStringParameters?.days;
             const parsedDays = daysParam ? Number(daysParam) : 90;

             request = {
                 ticker: event.queryStringParameters?.ticker || '',
                 days: isNaN(parsedDays) ? 90 : parsedDays
             };
        }
        // Fallback - shouldn't reach here
        else {
            return {
                statusCode: 400,
                headers: getCorsHeaders(),
                body: JSON.stringify({ error: 'Invalid event format' })
            };
        }

        // Validate ticker
        if (!request.ticker || typeof request.ticker !== 'string') {
            return {
                statusCode: 400,
                headers: getCorsHeaders(),
                body: JSON.stringify({ error: 'Missing or invalid ticker symbol' })
            };
        }

        // Validate days parameter
        const parsedDays = Number(request.days);
        if (request.days !== undefined && (!Number.isFinite(parsedDays) || parsedDays < 30)) {
             return {
                statusCode: 400,
                headers: getCorsHeaders(),
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

        const predNextDay = getPred(1);
        const predTwoWeek = getPred(14);
        const predOneMonth = getPred(30);

        // Format response
        const response: PredictionResponse = {
            ticker: request.ticker,
            predictions: {
                nextDay: predNextDay,
                twoWeek: predTwoWeek,
                oneMonth: predOneMonth
            }
        };

        // Persist prediction to DailySentimentAggregate table
        // Use read-merge-write to preserve other fields (eventCounts, avg scores, etc.)
        const today = new Date().toISOString().split('T')[0];

        try {
             // Read existing aggregate item if it exists
             const existingItem = await getDailyAggregate(request.ticker, today);

             // Merge prediction fields into existing item (or create new)
             const aggregateItem: DailySentimentAggregateItem = {
                 ticker: request.ticker,
                 date: today,
                 // Preserve existing fields if present, otherwise use defaults
                 eventCounts: existingItem?.eventCounts || {},
                 avgAspectScore: existingItem?.avgAspectScore,
                 avgFinBERTScore: existingItem?.avgFinBERTScore,
                 materialEventCount: existingItem?.materialEventCount,
                 // Update prediction fields with new values
                 nextDayDirection: predNextDay.direction,
                 nextDayProbability: predNextDay.probability,
                 twoWeekDirection: predTwoWeek.direction,
                 twoWeekProbability: predTwoWeek.probability,
                 oneMonthDirection: predOneMonth.direction,
                 oneMonthProbability: predOneMonth.probability
             };

             await putDailyAggregate(aggregateItem);
             console.log('[PredictionHandler] Saved prediction to DynamoDB:', { ticker: request.ticker, date: today });

        } catch (dbError) {
            console.error('[PredictionHandler] Failed to save prediction to DynamoDB:', dbError);
            // We don't fail the request, just log error
        }

        return {
            statusCode: 200,
            headers: getCorsHeaders(),
            body: JSON.stringify(response)
        };
    } catch (error: unknown) {
        console.error('[PredictionHandler] Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Handle known errors
        if (errorMessage.includes('Insufficient')) {
             return {
                statusCode: 400,
                headers: getCorsHeaders(),
                body: JSON.stringify({ error: errorMessage })
            };
        }

        return {
            statusCode: 500,
            headers: getCorsHeaders(),
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
}
