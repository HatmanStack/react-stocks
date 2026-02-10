/**
 * Branded Types for Compile-Time Safety
 *
 * Prevents accidentally passing raw strings where validated
 * tickers or date strings are expected.
 */

declare const TickerBrand: unique symbol;
declare const DateStringBrand: unique symbol;

/** A validated, uppercase ticker symbol (e.g. "AAPL", "BRK.A") */
export type Ticker = string & { readonly [TickerBrand]: typeof TickerBrand };

/** A validated date in YYYY-MM-DD format */
export type DateString = string & { readonly [DateStringBrand]: typeof DateStringBrand };

/**
 * Validate and brand a raw string as a Ticker.
 * @throws Error if the string is not a valid ticker format.
 */
export function asTicker(raw: string): Ticker {
  const normalized = raw.toUpperCase().trim();
  if (!/^[A-Z0-9.-]+$/.test(normalized) || normalized.length === 0) {
    throw new Error(`Invalid ticker: "${raw}"`);
  }
  return normalized as Ticker;
}

/**
 * Validate and brand a raw string as a DateString.
 * @throws Error if the string is not a valid YYYY-MM-DD date.
 */
export function asDateString(raw: string): DateString {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error(`Invalid date format: "${raw}". Expected YYYY-MM-DD.`);
  }
  const [year, month, day] = raw.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (
    isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error(`Invalid calendar date: "${raw}"`);
  }
  return raw as DateString;
}
