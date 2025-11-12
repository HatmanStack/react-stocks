/**
 * Mock for src/database/index.ts
 * Avoids dynamic import issues in Jest
 */

// Import the actual native database implementation directly
import * as database from '../../../src/database/database';

export const initializeDatabase = jest.fn(database.initializeDatabase);
export const getDatabase = jest.fn(database.getDatabase);
export const closeDatabase = jest.fn(database.closeDatabase);
export const resetDatabase = jest.fn(database.resetDatabase);
