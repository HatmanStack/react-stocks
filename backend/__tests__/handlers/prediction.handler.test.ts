import { jest } from '@jest/globals';
// eslint-disable-next-line import/no-unresolved
import { APIGatewayProxyEventV2 } from 'aws-lambda';

// Hoist mock
const mockRunPipeline = jest.fn();

// Mock pipeline module
jest.unstable_mockModule('../../src/services/pipeline', () => ({
    runPredictionPipeline: mockRunPipeline
}));

// Import handler
const { predictionHandler } = await import('../../src/handlers/prediction.handler');

describe('Prediction Handler', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return 400 if ticker is missing', async () => {
        const event = {
            body: JSON.stringify({ days: 30 }) // No ticker
        } as APIGatewayProxyEventV2;

        const response = await predictionHandler(event);

        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body).error).toContain('Missing');
    });

    it('should return 400 if days < 30', async () => {
        const event = {
            body: JSON.stringify({ ticker: 'AAPL', days: 10 })
        } as APIGatewayProxyEventV2;

        const response = await predictionHandler(event);

        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body).error).toContain('30');
    });

    it('should call pipeline and return formatted response on success', async () => {
        const event = {
            body: JSON.stringify({ ticker: 'AAPL', days: 90 })
        } as APIGatewayProxyEventV2;

        // Mock successful pipeline response
        // Use as any to bypass TS strictness on mock generic types
        (mockRunPipeline as any).mockResolvedValue([
            { horizon: 1, direction: 'up', probability: 0.7 },
            { horizon: 14, direction: 'down', probability: 0.6 },
            { horizon: 30, direction: 'up', probability: 0.8 }
        ]);

        const response = await predictionHandler(event);

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        expect(body.ticker).toBe('AAPL');
        expect(body.predictions.nextDay).toEqual({ direction: 'up', probability: 0.7 });
        expect(body.predictions.twoWeek).toEqual({ direction: 'down', probability: 0.6 });
        expect(body.predictions.oneMonth).toEqual({ direction: 'up', probability: 0.8 });

        expect(mockRunPipeline).toHaveBeenCalledWith('AAPL', 90);
    });

    it('should handle query parameters if body is empty', async () => {
        const event = {
            queryStringParameters: { ticker: 'GOOGL', days: '60' }
        } as unknown as APIGatewayProxyEventV2;

        (mockRunPipeline as any).mockResolvedValue([]);

        const response = await predictionHandler(event);

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body).ticker).toBe('GOOGL');
        expect(mockRunPipeline).toHaveBeenCalledWith('GOOGL', 60);
    });

    it('should return 400 for known pipeline errors (Insufficient data)', async () => {
        const event = {
            body: JSON.stringify({ ticker: 'AAPL', days: 90 })
        } as APIGatewayProxyEventV2;

        (mockRunPipeline as any).mockRejectedValue(new Error('Insufficient training data: At least 10 samples required.'));

        const response = await predictionHandler(event);

        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body).error).toContain('Insufficient training data');
    });

    it('should return 500 for unknown errors', async () => {
        const event = {
            body: JSON.stringify({ ticker: 'AAPL', days: 90 })
        } as APIGatewayProxyEventV2;

        (mockRunPipeline as any).mockRejectedValue(new Error('Something exploded'));

        const response = await predictionHandler(event);

        expect(response.statusCode).toBe(500);
        expect(JSON.parse(response.body).error).toBe('Internal server error');
    });
});
