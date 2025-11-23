import * as DailySentimentAggregateRepository from '../repositories/dailySentimentAggregate.repository';
import * as NewsCacheRepository from '../repositories/newsCache.repository';

/**
 * Smart Refresh Logic
 * Determines if prediction should be triggered based on new articles
 *
 * @param ticker - Stock ticker symbol
 * @returns true if prediction should be triggered, false otherwise
 */
export async function shouldTriggerPrediction(ticker: string): Promise<boolean> {
    try {
        // Validate ticker parameter
        if (!ticker || ticker.trim().length === 0) {
            console.error('[SmartRefresh] Invalid ticker provided');
            return false;
        }

        // 1. Get latest prediction date
        const latestAggregate = await DailySentimentAggregateRepository.getLatestDailyAggregate(ticker);

        if (!latestAggregate) {
            console.log(`[SmartRefresh] No previous prediction for ${ticker}, triggering.`);
            return true;
        }

        // 2. Get latest article date
        // We query all articles and find the max date.
        // Optimization: If we had a secondary index on date, we could query efficiently.
        // For now, assume queryArticlesByTicker is reasonable.
        const articles = await NewsCacheRepository.queryArticlesByTicker(ticker);

        if (articles.length === 0) {
            console.log(`[SmartRefresh] No articles for ${ticker}, skipping prediction.`);
            return false;
        }

        // Find latest article date
        // article.article.date is YYYY-MM-DD string
        const latestArticle = articles.reduce((max, current) => {
            return current.article.date > max.article.date ? current : max;
        });
        const latestArticleDate = latestArticle.article.date;

        // 3. Compare dates
        // If latest article is NEWER than latest prediction record, trigger.
        // Note: Prediction record date usually corresponds to the "as of" date.
        // If we have a prediction "as of" 2025-01-10, and a new article comes in for 2025-01-11, we re-predict.
        // If new article is 2025-01-10 (same day), we might want to re-predict if it's intraday.
        // But our granularity is daily.
        // Let's trigger if latestArticleDate >= latestAggregate.date
        // Wait, if it's equal, we might have already processed it.
        // But we don't know if THIS run included it.
        // Actually, simpler logic:
        // If we processed new articles in THIS request (passed from caller), we trigger.
        // But the caller (handler) knows if it processed articles.

        // This utility is useful if we want to check against DB state independent of current run.
        // e.g. if the user refreshes but no new articles were fetched (cached), do we re-predict?
        // If the previous prediction is stale (e.g. older than 1 day) even if no new articles?
        // Maybe we should just return true if:
        // 1. No prediction exists
        // 2. Latest article date > Latest prediction date

        if (latestArticleDate > latestAggregate.date) {
            console.log(`[SmartRefresh] New articles found (${latestArticleDate} > ${latestAggregate.date}) for ${ticker}, triggering.`);
            return true;
        }

        console.log(`[SmartRefresh] No new articles for ${ticker} (Latest: ${latestArticleDate}, Pred: ${latestAggregate.date}), skipping.`);
        return false;

    } catch (error) {
        console.error(`[SmartRefresh] Error checking trigger for ${ticker}:`, error);
        // Fail safe: trigger if in doubt
        return true;
    }
}
