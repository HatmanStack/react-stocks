// Mock for expo-sqlite module

export class SQLiteDatabase {
  private data: Map<string, any[]> = new Map();

  execAsync = jest.fn(async (sql: string) => {
    // Mock table creation, no-op for CREATE TABLE statements
    return Promise.resolve();
  });

  getAllAsync = jest.fn(async <T = any>(sql: string, params?: any[]): Promise<T[]> => {
    // Return empty array by default
    return Promise.resolve([]);
  });

  getFirstAsync = jest.fn(async <T = any>(sql: string, params?: any[]): Promise<T | null> => {
    // Return null by default
    return Promise.resolve(null);
  });

  runAsync = jest.fn(async (sql: string, params?: any[]) => {
    return Promise.resolve({ changes: 1, lastInsertRowId: 1 });
  });

  withTransactionAsync = jest.fn(async <T>(callback: () => Promise<T>): Promise<T> => {
    // Execute the callback directly without actual transaction
    return callback();
  });

  closeAsync = jest.fn(async () => {
    return Promise.resolve();
  });
}

const mockDatabase = new SQLiteDatabase();

export const openDatabaseAsync = jest.fn(async (dbName: string) => {
  // Return a new database instance
  return mockDatabase;
});

export const openDatabaseSync = jest.fn();
export const deleteDatabaseAsync = jest.fn();
export const deleteDatabaseSync = jest.fn();

export default {
  openDatabaseAsync,
  openDatabaseSync,
  deleteDatabaseAsync,
  deleteDatabaseSync,
  SQLiteDatabase,
};
