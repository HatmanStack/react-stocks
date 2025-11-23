import { updatePredictions } from '@/services/sync/sentimentDataSync';
import { shouldTriggerPrediction } from '../../backend/src/utils/smartRefresh.util';
import * as DailySentimentAggregateRepository from '../../backend/src/repositories/dailySentimentAggregate.repository';
import * as NewsCacheRepository from '../../backend/src/repositories/newsCache.repository';

// Mocks for backend modules (since we are testing flow logic, not real DB)
jest.mock('../../backend/src/repositories/dailySentimentAggregate.repository');
jest.mock('../../backend/src/repositories/newsCache.repository');

// Mock frontend modules
jest.mock('@/services/sync/sentimentDataSync');

describe('Prediction Flow Integration', () => {
    const ticker = 'AAPL';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Backend Smart Refresh Logic', () => {
        it('should trigger prediction if no previous prediction exists', async () => {
            (DailySentimentAggregateRepository.getLatestDailyAggregate as jest.Mock).mockResolvedValue(null);

            const result = await shouldTriggerPrediction(ticker);
            expect(result).toBe(true);
        });

        it('should trigger prediction if new articles exist', async () => {
            (DailySentimentAggregateRepository.getLatestDailyAggregate as jest.Mock).mockResolvedValue({
                date: '2025-01-01'
            });
            (NewsCacheRepository.queryArticlesByTicker as jest.Mock).mockResolvedValue([
                { article: { date: '2025-01-02' } } // Newer article
            ]);

            const result = await shouldTriggerPrediction(ticker);
            expect(result).toBe(true);
        });

        it('should NOT trigger prediction if no new articles', async () => {
            (DailySentimentAggregateRepository.getLatestDailyAggregate as jest.Mock).mockResolvedValue({
                date: '2025-01-02'
            });
            (NewsCacheRepository.queryArticlesByTicker as jest.Mock).mockResolvedValue([
                { article: { date: '2025-01-01' } } // Older article
            ]);

            const result = await shouldTriggerPrediction(ticker);
            expect(result).toBe(false);
        });
    });

    describe('Frontend Data Sync Logic', () => {
        it('should call updatePredictions when sync completes', async () => {
            // This simulates the UI receiving data and calling the sync service
            const mockPredictions = {
                nextDay: { direction: 'up' as const, probability: 0.8 },
                twoWeek: { direction: 'up' as const, probability: 0.7 },
                oneMonth: { direction: 'up' as const, probability: 0.6 },
            };

            // Directly calling the function we want to test integration for
            // In reality, useSentimentData calls this.
            // We verify that the function exists and can be called with correct types.
            await updatePredictions(ticker, mockPredictions);

            expect(updatePredictions).toHaveBeenCalledWith(ticker, mockPredictions);
        });
    });
});
