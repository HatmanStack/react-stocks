/**
 * Input Validation Utilities
 *
 * Centralized validation for request parameters across all handlers.
 * Eliminates inconsistent ticker/date regex patterns.
 */

/** General ticker pattern: letters, numbers, dots, hyphens (BRK.A, BF-B) */
export const TICKER_REGEX = /^[A-Z0-9.-]+$/;

/** Strict ticker pattern: letters and numbers only (Finnhub compatibility) */
export const TICKER_REGEX_STRICT = /^[A-Z0-9]+$/;

/** Date format: YYYY-MM-DD */
export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate and normalize a ticker symbol.
 * @param raw - Raw ticker input
 * @param strict - Use strict mode (no dots/hyphens) for Finnhub
 * @returns Normalized uppercase ticker or null if invalid
 */
export function validateTicker(raw: unknown, strict?: boolean): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const normalized = raw.toUpperCase().trim();
  const pattern = strict ? TICKER_REGEX_STRICT : TICKER_REGEX;
  return pattern.test(normalized) ? normalized : null;
}

/**
 * Validate a date string format (YYYY-MM-DD).
 */
export function validateDateFormat(raw: unknown): raw is string {
  return typeof raw === 'string' && DATE_REGEX.test(raw);
}

/**
 * Validate that a date range is logically valid (start <= end).
 * @returns Error message or null if valid
 */
export function validateDateRange(start: string, end: string): string | null {
  if (start > end) {
    return `Invalid date range: startDate (${start}) must be before endDate (${end})`;
  }
  return null;
}
