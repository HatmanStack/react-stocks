/**
 * Hashing Utility Functions
 *
 * Provides hash generation for article deduplication using SHA-256.
 */

import { createHash } from 'crypto';

/**
 * Generate consistent hash for an article URL
 * Uses SHA-256 and returns first 16 characters for reasonable uniqueness
 *
 * @param url - Article URL to hash
 * @returns 16-character hex hash string
 * @throws Error if URL is empty or invalid
 *
 * @example
 * const hash = generateArticleHash('https://example.com/article');
 * // Returns: 'a1b2c3d4e5f6g7h8'
 */
export function generateArticleHash(url: string): string {
  // Validate input
  if (!url || typeof url !== 'string') {
    throw new Error('URL must be a non-empty string');
  }

  // Normalize URL: trim whitespace and convert to lowercase
  const normalizedUrl = url.trim().toLowerCase();

  if (normalizedUrl.length === 0) {
    throw new Error('URL cannot be empty or whitespace');
  }

  // Generate SHA-256 hash
  const hash = createHash('sha256').update(normalizedUrl).digest('hex');

  // Return first 16 characters (sufficient for uniqueness in our use case)
  return hash.substring(0, 16);
}

/**
 * Validate hash format
 * Checks if a string is a valid hash (16 hex characters)
 *
 * @param hash - Hash string to validate
 * @returns true if valid hash format, false otherwise
 *
 * @example
 * isValidHash('a1b2c3d4e5f6g7h8'); // Returns: true
 * isValidHash('invalid'); // Returns: false
 */
export function isValidHash(hash: string): boolean {
  if (!hash || typeof hash !== 'string') {
    return false;
  }

  // Must be exactly 16 characters of hex (0-9, a-f)
  return /^[0-9a-f]{16}$/.test(hash);
}

/**
 * Generate hashes for multiple URLs in bulk
 * Efficient batch processing for article collections
 *
 * @param urls - Array of URLs to hash
 * @returns Array of hash strings in same order as input
 * @throws Error if any URL is invalid
 *
 * @example
 * const hashes = generateArticleHashes([
 *   'https://example.com/article1',
 *   'https://example.com/article2'
 * ]);
 * // Returns: ['a1b2c3d4e5f6g7h8', 'x9y8z7w6v5u4t3s2']
 */
export function generateArticleHashes(urls: string[]): string[] {
  if (!Array.isArray(urls)) {
    throw new Error('URLs must be an array');
  }

  return urls.map((url) => generateArticleHash(url));
}
