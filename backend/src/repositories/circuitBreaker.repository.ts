/**
 * Circuit Breaker Repository
 *
 * Persists circuit breaker state to DynamoDB for cross-invocation survival.
 * Uses single-table design with composite keys: PK = CIRCUIT#serviceName, SK = STATE
 *
 * See Phase 0 ADR-004 for design rationale.
 */

import { getItem, putItem } from '../utils/dynamodb.util.js';
import { makeCircuitPK, makeStateSK } from '../types/dynamodb.types.js';
import type { CircuitBreakerItem } from '../types/dynamodb.types.js';

const ML_SENTIMENT_SERVICE = 'mlsentiment';

/**
 * Get circuit breaker state for ML sentiment service
 *
 * @returns Current circuit breaker state, or default closed state if no record exists
 */
export async function getCircuitState(): Promise<{
  consecutiveFailures: number;
  circuitOpenUntil: number;
}> {
  const pk = makeCircuitPK(ML_SENTIMENT_SERVICE);
  const sk = makeStateSK();

  const item = await getItem<CircuitBreakerItem>(pk, sk);

  if (!item) {
    // Return default closed state if no record exists
    return {
      consecutiveFailures: 0,
      circuitOpenUntil: 0,
    };
  }

  return {
    consecutiveFailures: item.consecutiveFailures,
    circuitOpenUntil: item.circuitOpenUntil,
  };
}

/**
 * Update circuit breaker state after success or failure
 *
 * @param consecutiveFailures - Current number of consecutive failures
 * @param circuitOpenUntil - Unix timestamp (ms) when circuit should close, or 0 if closed
 * @param event - Whether this update is recording a success or failure
 */
export async function updateCircuitState(
  consecutiveFailures: number,
  circuitOpenUntil: number,
  event: 'success' | 'failure',
): Promise<void> {
  const pk = makeCircuitPK(ML_SENTIMENT_SERVICE);
  const sk = makeStateSK();
  const now = new Date().toISOString();

  // Fetch existing item to preserve createdAt timestamp
  const existing = await getItem<CircuitBreakerItem>(pk, sk);

  const item: CircuitBreakerItem = {
    pk,
    sk,
    entityType: 'CIRCUIT',
    serviceName: ML_SENTIMENT_SERVICE,
    consecutiveFailures,
    circuitOpenUntil,
    lastSuccess: event === 'success' ? now : existing?.lastSuccess,
    lastFailure: event === 'failure' ? now : existing?.lastFailure,
    createdAt: existing?.createdAt ?? now, // Preserve original creation time
    updatedAt: now,
  };

  await putItem(item);
}

/**
 * Record a successful ML sentiment call (reset circuit)
 */
export async function recordSuccess(): Promise<void> {
  await updateCircuitState(0, 0, 'success');
}

/**
 * Record a failed ML sentiment call
 *
 * @param currentFailures - Current number of consecutive failures
 * @param failureThreshold - Number of failures before opening circuit
 * @param cooldownMs - How long to keep circuit open in milliseconds
 * @returns Whether circuit is now open, and when it will close
 */
export async function recordFailure(
  currentFailures: number,
  failureThreshold: number,
  cooldownMs: number,
): Promise<{ isOpen: boolean; openUntil: number }> {
  const newFailures = currentFailures + 1;
  let circuitOpenUntil = 0;

  if (newFailures >= failureThreshold) {
    circuitOpenUntil = Date.now() + cooldownMs;
    console.warn(
      `[CircuitBreaker] Circuit OPEN after ${failureThreshold} failures, cooldown ${cooldownMs}ms`,
    );
  }

  await updateCircuitState(newFailures, circuitOpenUntil, 'failure');

  return {
    isOpen: circuitOpenUntil > 0,
    openUntil: circuitOpenUntil,
  };
}
