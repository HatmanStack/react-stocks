/**
 * Number formatting utilities for currency, percentages, and large numbers
 */

/**
 * Format a number as currency with $ symbol
 * @param value - Number to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted currency string (e.g., "$123.45")
 */
export function formatCurrency(value: number, decimals: number = 2): string {
  return `$${value.toFixed(decimals)}`;
}

/**
 * Format a price with dollar sign and 2 decimal places (alias for formatCurrency with null handling)
 * @param price - Price value to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted price string (e.g., "$123.45")
 */
export function formatPrice(price: number | null | undefined, decimals = 2): string {
  if (price === null || price === undefined) {
    return 'N/A';
  }
  return `$${price.toFixed(decimals)}`;
}

/**
 * Format a number as percentage
 * @param value - Number to format as decimal (e.g., 0.0525 for 5.25%)
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted percentage string (e.g., "+5.25%", "-3.25%")
 */
export function formatPercentage(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined) {
    return 'N/A';
  }
  const percentage = value * 100;
  const sign = percentage >= 0 ? '+' : '';
  return `${sign}${percentage.toFixed(decimals)}%`;
}

/**
 * Format large numbers with K, M, B suffixes
 * @param volume - Number to format
 * @returns Formatted string (e.g., "1.5M", "23.4K")
 */
export function formatVolume(volume: number | null | undefined): string {
  if (volume === null || volume === undefined) {
    return 'N/A';
  }

  if (volume >= 1_000_000_000) {
    return `${(volume / 1_000_000_000).toFixed(1)}B`;
  } else if (volume >= 1_000_000) {
    return `${(volume / 1_000_000).toFixed(1)}M`;
  } else if (volume >= 1_000) {
    return `${(volume / 1_000).toFixed(1)}K`;
  } else {
    return volume.toString();
  }
}

/**
 * Format large numbers with K/M/B abbreviations (alias for formatVolume)
 * @param num - Number value to format
 * @returns Formatted number string (e.g., "1.23B", "1.00M")
 */
export function formatLargeNumber(num: number | null | undefined): string {
  return formatVolume(num);
}

/**
 * Format market cap with appropriate suffix
 * @param value - Market cap value
 * @returns Formatted string (e.g., "$1.2T", "$500B", "$50M")
 */
export function formatMarketCap(value: number): string {
  if (value >= 1_000_000_000_000) {
    return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  } else if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  } else if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  } else {
    return `$${value.toFixed(0)}`;
  }
}

/**
 * Round a number to specified decimal places
 * @param value - Number to round
 * @param decimals - Number of decimal places
 * @returns Rounded number
 */
export function roundToDecimals(value: number, decimals: number): number {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

/**
 * Format a number with thousands separators
 * @param value - Number to format
 * @returns Formatted string (e.g., "1,234,567")
 */
export function formatWithCommas(value: number): string {
  return value.toLocaleString('en-US');
}
