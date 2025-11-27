import type { ScheduledEvent } from 'aws-lambda';
import { warmAllTopTickers } from '../services/cacheWarming.service';
import { logError } from '../utils/error.util';

/**
 * Lambda handler for scheduled cache warming
 * Triggered by EventBridge
 */
export async function handler(event: ScheduledEvent) {
  console.log('[CacheWarming] Handler triggered', JSON.stringify(event));

  try {
    const result = await warmAllTopTickers();
    console.log(`[CacheWarming] Completed: ${result.success} success, ${result.failure} errors`);
    return result;
  } catch (error) {
    logError('CacheWarming', error, {});
    throw error; // Ensure Lambda marks execution as failed
  }
}
