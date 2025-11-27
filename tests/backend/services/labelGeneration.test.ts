import { generate_label, aggregate_daily_features } from '../../../backend/src/services/featureEngineering';
import { StockPrice, ArticleSentiment } from '../../../backend/src/types/prediction.types';

describe('Feature Engineering - Label Generation', () => {

    describe('generate_label', () => {
        it('should return 1 for upward movement > 1%', () => {
            // (102 - 100) / 100 = 0.02 > 0.01
            expect(generate_label(100, 102)).toBe(1);
        });

        it('should return 0 for downward movement < -1%', () => {
            // (98 - 100) / 100 = -0.02 < -0.01
            expect(generate_label(100, 98)).toBe(0);
        });

        it('should return null for small movement within threshold', () => {
            // (100.5 - 100) / 100 = 0.005 (within ±0.01)
            expect(generate_label(100, 100.5)).toBeNull();
            // (99.5 - 100) / 100 = -0.005 (within ±0.01)
            expect(generate_label(100, 99.5)).toBeNull();
        });

        it('should return null for exact threshold boundary', () => {
             // Depending on implementation > vs >=. Code uses >.
             // (101 - 100) / 100 = 0.01. 0.01 > 0.01 is False. Returns null.
             expect(generate_label(100, 101)).toBeNull();
        });

        it('should return 1 if slightly above threshold', () => {
             expect(generate_label(100, 101.01)).toBe(1);
        });

        it('should return null if previous close is <= 0', () => {
            expect(generate_label(0, 100)).toBeNull();
            expect(generate_label(-10, 100)).toBeNull();
        });
    });

    describe('aggregate_daily_features with labels', () => {
         const mockPrices: StockPrice[] = [
            { date: '2023-01-01', open: 100, high: 110, low: 90, close: 100, volume: 1000 },
            { date: '2023-01-02', open: 100, high: 110, low: 90, close: 102, volume: 1000 }, // +2% vs Prev (100) -> Label 1
            { date: '2023-01-03', open: 100, high: 110, low: 90, close: 90, volume: 1000 },  // -11.7% vs Prev (102) -> Label 0
            { date: '2023-01-04', open: 100, high: 110, low: 90, close: 90, volume: 1000 }   // 0% vs Prev (90) -> Label null
        ];

        const mockArticles: ArticleSentiment[] = [];

        it('should assign correct labels based on price history', () => {
            const features = aggregate_daily_features(mockPrices, mockArticles, 'TEST');

            expect(features).toHaveLength(4);

            // Day 1: No previous day -> Label null
            expect(features[0].date).toBe('2023-01-01');
            expect(features[0].label).toBeNull();

            // Day 2: Close 102, Prev 100 -> +2% -> Label 1
            expect(features[1].date).toBe('2023-01-02');
            expect(features[1].label).toBe(1);

            // Day 3: Close 90, Prev 102 -> -11.7% -> Label 0
            expect(features[2].date).toBe('2023-01-03');
            expect(features[2].label).toBe(0);

            // Day 4: Close 90, Prev 90 -> 0% -> Label null
            expect(features[3].date).toBe('2023-01-04');
            expect(features[3].label).toBeNull();
        });
    });
});
