import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { APIGatewayResponse } from '../utils/response.util';
import { PredictionRequest, PredictionResponse } from '../types/prediction.types';
import { runPredictionPipeline } from '../services/pipeline';
import { putDailyAggregate, getDailyAggregate } from '../repositories/dailySentimentAggregate.repository';
import { DailySentimentAggregateItem } from '../types/dynamodb.types';

const RESPONSE_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
};

export async function predictionHandler(
    event: APIGatewayProxyEventV2 | any
): Promise<APIGatewayResponse> {
    console.log('[PredictionHandler] Request received. Event type:', typeof event);

    try {
        // Parse request
        let request: PredictionRequest;

        // Case 1: API Gateway Event (has body property)
        if (event.body) {
            try {
                request = JSON.parse(event.body);
            } catch {
                return {
                    statusCode: 400,
                    headers: RESPONSE_HEADERS,
                    body: JSON.stringify({ error: 'Invalid JSON in request body' })
                };
            }
        }
        // Case 2: Direct Lambda Invocation (event is the payload)
        else if (event.ticker) {
             console.log('[PredictionHandler] Direct Lambda invocation detected');
             request = {
                 ticker: event.ticker,
                 days: event.days || 90
             };
        }
        // Case 3: API Gateway GET Request (Query Parameters)
        else {
             // Handle query params if body missing (optional, but good for testing)
             const daysParam = event.queryStringParameters?.days;
             const parsedDays = daysParam ? Number(daysParam) : 90;

             request = {
                 ticker: event.queryStringParameters?.ticker || '',
                 days: isNaN(parsedDays) ? 90 : parsedDays
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
