/**
 * Number formatting utilities
 */

export function formatCurrency(value: number, decimals = 2): string {
  return `$${value.toFixed(decimals)}`;
}

export function formatPrice(price: number | null | undefined, decimals = 2): string {
  if (price == null) return 'N/A';
  return `$${price.toFixed(decimals)}`;
}

export function formatPercentage(value: number | null | undefined, decimals = 2): string {
  if (value == null) return 'N/A';
  const pct = value * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(decimals)}%`;
}

export function formatVolume(volume: number | null | undefined): string {
  if (volume == null) return 'N/A';
  if (volume >= 1_000_000_000) return `${(volume / 1_000_000_000).toFixed(1)}B`;
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(1)}M`;
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(1)}K`;
  return volume.toString();
}

export function formatMarketCap(value: number): string {
  if (value >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  return `$${value.toFixed(0)}`;
}

export function roundToDecimals(value: number, decimals: number): number {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

export function formatWithCommas(value: number): string {
  return value.toLocaleString('en-US');
}
