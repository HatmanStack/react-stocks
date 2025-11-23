/**
 * Database client interface
 * Abstracts over expo-sqlite (native) and localStorage (web) implementations
 */

/**
 * Common database interface that works across both native and web platforms
 * - Native: Uses expo-sqlite SQLiteDatabase
 * - Web: Uses custom WebDatabase with localStorage backend
 */
export interface DatabaseClient {
  /**
   * Execute a SQL statement without returning results
   * @param sql - SQL statement to execute
   * @param params - Optional parameters for the statement
   */
  runAsync(sql: string, params?: any[]): Promise<any>;

  /**
   * Execute a SQL query and return all matching rows
   * @param sql - SQL query to execute
   * @param params - Optional parameters for the query
   * @returns Array of result rows
   */
  getAllAsync<T = any>(sql: string, params?: any[]): Promise<T[]>;

  /**
   * Execute a SQL query and return the first matching row
   * @param sql - SQL query to execute
   * @param params - Optional parameters for the query
   * @returns First result row or null if no match
   */
  getFirstAsync<T = any>(sql: string, params?: any[]): Promise<T | null>;

  /**
   * Execute a SQL statement with transaction support (optional)
   * @param callback - Transaction callback
   */
  withTransactionAsync(callback: () => Promise<void>): Promise<void>;

  /**
   * Execute raw SQL (for native compatibility)
   * @param sql - SQL statement to execute
   */
  execAsync(sql: string): Promise<void>;
}
