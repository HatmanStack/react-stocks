import { describe, it, expect } from '@jest/globals';
import { aggregate_daily_features, compute_materiality_weighted_avg, compute_event_one_hot_weighted } from '../../../backend/src/services/featureEngineering';
import { StockPrice, ArticleSentiment } from '../../../backend/src/types/prediction.types';

describe('Feature Engineering Service', () => {

    describe('compute_materiality_weighted_avg', () => {
        it('should compute correct weighted average', () => {
            const values = [10, 20];
            const weights = [0.5, 0.5];
            // (10*0.5 + 20*0.5) / (0.5+0.5) = (5+10)/1 = 15
            expect(compute_materiality_weighted_avg(values, weights)).toBe(15);
        });

        it('should handle different weights', () => {
            const values = [10, 20];
            const weights = [0.1, 0.9];
            // (10*0.1 + 20*0.9) / 1 = (1 + 18) = 19
            expect(compute_materiality_weighted_avg(values, weights)).toBeCloseTo(19);
        });

        it('should return 0 for empty input', () => {
            expect(compute_materiality_weighted_avg([], [])).toBe(0);
        });

        it('should return 0 if total weight is 0', () => {
            const values = [10, 20];
            const weights = [0, 0];
            expect(compute_materiality_weighted_avg(values, weights)).toBe(0);
        });

        it('should throw if lengths mismatch', () => {
             expect(() => compute_materiality_weighted_avg([1], [])).toThrow();
        });
    });

    describe('compute_event_one_hot_weighted', () => {
        it('should aggregate event weights correctly', () => {
            const articles: ArticleSentiment[] = [
                { hash: '1', date: '2023-01-01', eventType: 'EARNINGS', materialityScore: 0.8, aspectScore: 0, mlScore: 0 },
                { hash: '2', date: '2023-01-01', eventType: 'EARNINGS', materialityScore: 0.5, aspectScore: 0, mlScore: 0 },
                { hash: '3', date: '2023-01-01', eventType: 'M&A', materialityScore: 0.9, aspectScore: 0, mlScore: 0 },
                { hash: '4', date: '2023-01-01', eventType: 'GENERAL', materialityScore: 0.1, aspectScore: 0, mlScore: 0 },
                { hash: '5', date: '2023-01-01', eventType: null, materialityScore: 0.2, aspectScore: 0, mlScore: 0 } // Should map to GENERAL
            ];

            const result = compute_event_one_hot_weighted(articles);

            expect(result.event_earnings).toBeCloseTo(1.3); // 0.8 + 0.5
            expect(result.event_ma).toBe(0.9);
            expect(result.event_general).toBeCloseTo(0.3); // 0.1 + 0.2
            expect(result.event_product).toBe(0);
        });
    });

    describe('aggregate_daily_features', () => {
        const mockPrices: StockPrice[] = [
            { date: '2023-01-01', open: 100, high: 110, low: 90, close: 105, volume: 1000 },
            { date: '2023-01-02', open: 105, high: 115, low: 100, close: 110, volume: 1500 }
        ];

        const mockArticles: ArticleSentiment[] = [
            // Day 1: 1 article, high materiality
            { hash: '1', date: '2023-01-01', eventType: 'EARNINGS', materialityScore: 1.0, aspectScore: 0.5, mlScore: 0.8 },
            // Day 2: 2 articles, mixed materiality
            { hash: '2', date: '2023-01-02', eventType: 'M&A', materialityScore: 0.8, aspectScore: 0.2, mlScore: 0.6 },
            { hash: '3', date: '2023-01-02', eventType: 'GENERAL', materialityScore: 0.2, aspectScore: -0.5, mlScore: -0.2 }
        ];

        it('should aggregate features for each day with price data', () => {
            const features = aggregate_daily_features(mockPrices, mockArticles, 'TEST');

            expect(features).toHaveLength(2);

            // Day 1
            expect(features[0].date).toBe('2023-01-01');
            expect(features[0].close).toBe(105);
            expect(features[0].event_earnings).toBe(1.0);
            expect(features[0].aspect_score).toBe(0.5); // Only 1 article with wt 1.0
            expect(features[0].ml_score).toBe(0.8);

            // Day 2
            expect(features[1].date).toBe('2023-01-02');
            expect(features[1].event_ma).toBe(0.8);
            expect(features[1].event_general).toBe(0.2);

            // Weighted Avg Aspect: (0.2*0.8 + -0.5*0.2) / (0.8+0.2) = (0.16 - 0.1) / 1.0 = 0.06
            expect(features[1].aspect_score).toBeCloseTo(0.06);

            // Weighted Avg FinBERT: (0.6*0.8 + -0.2*0.2) / 1.0 = (0.48 - 0.04) = 0.44
            expect(features[1].ml_score).toBeCloseTo(0.44);
        });

        it('should handle days with no articles', () => {
            const features = aggregate_daily_features(mockPrices, [], 'TEST'); // No articles

            expect(features).toHaveLength(2);
            expect(features[0].event_earnings).toBe(0);
            expect(features[0].aspect_score).toBe(0);
            expect(features[0].ml_score).toBe(0);
        });
    });
});
