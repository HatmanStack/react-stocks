import { predictionHandler } from '../../src/handlers/prediction.handler';
import { APIGatewayProxyEvent } from 'aws-lambda';

describe('predictionHandler', () => {
    it('should return 400 for invalid JSON body', async () => {
        const event = {
            body: '{ invalid json }'
        } as APIGatewayProxyEvent;

        const response = await predictionHandler(event);

        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body).error).toBe('Invalid JSON body');
    });

    it('should return 400 for missing ticker', async () => {
        const event = {
            body: JSON.stringify({ days: 30 })
        } as APIGatewayProxyEvent;

        const response = await predictionHandler(event);

        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body).error).toBe('Missing or invalid ticker');
    });

    it('should return 400 for missing or invalid days', async () => {
        const event = {
            body: JSON.stringify({ ticker: 'AAPL', days: 10 }) // Too few days
        } as APIGatewayProxyEvent;

        const response = await predictionHandler(event);

        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body).error).toContain('Invalid days parameter');
    });

    it('should return 200 with valid request and stubbed response', async () => {
        const event = {
            body: JSON.stringify({ ticker: 'AAPL', days: 30 })
        } as APIGatewayProxyEvent;

        const response = await predictionHandler(event);

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.ticker).toBe('AAPL');
        expect(body.predictions).toBeDefined();
        expect(body.predictions.nextDay).toBeDefined();
        expect(body.predictions.twoWeek).toBeDefined();
        expect(body.predictions.oneMonth).toBeDefined();
    });
});
