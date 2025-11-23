import { initializeDatabase, getDatabase, resetDatabase, closeDatabase } from '../../../src/database/database';
import { getDatabase as getWebDatabase, resetDatabase as resetWebDatabase } from '../../../src/database/database.web';

// Mock expo-sqlite
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve({
    execAsync: jest.fn(),
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue({ user_version: 0 }),
    closeAsync: jest.fn(),
  })),
}));

// Mock localStorage for WebDB tests
const localStorageMock = (function() {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    })
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock
});

// Mock requestIdleCallback for WebDB
Object.defineProperty(global, 'requestIdleCallback', {
  value: (cb: Function) => {
    cb(); // execute immediately
  }
});


describe('Database Migrations - Prediction Fields', () => {
  const PREDICTION_COLUMNS = [
    'nextDayDirection', 'nextDayProbability',
    'twoWeekDirection', 'twoWeekProbability',
    'oneMonthDirection', 'oneMonthProbability'
  ];

  describe('SQLite Migration', () => {
    let mockDb: any;

    beforeEach(async () => {
      jest.clearAllMocks();
      await initializeDatabase();
      mockDb = await getDatabase();

      // Setup mock behavior for column checks
      mockDb.getAllAsync.mockImplementation((sql: string) => {
        if (sql.includes('PRAGMA table_info')) {
          // Return empty to simulate columns don't exist, triggering migration
          return Promise.resolve([]);
        }
        if (sql.includes('user_version')) {
           return Promise.resolve({ user_version: 2 });
        }
        if (sql.includes('sqlite_master')) {
            return Promise.resolve([{ name: 'stock_details' }]);
        }
        return Promise.resolve([]);
      });
    });

    it('should add prediction columns to combined_word_count_details', async () => {
        // Reset internal state for test
        await closeDatabase();

        // Setup mock to return version 2 (needs upgrade to 3)
        const requireSqlite = require('expo-sqlite');
        const mockExecAsync = jest.fn();
        const mockGetAllAsync = jest.fn().mockImplementation((sql) => {
            if (sql.includes('user_version')) return Promise.resolve([{ user_version: 2 }]);
            if (sql.includes('sqlite_master')) return Promise.resolve([{ name: 'stock_details' }]);
            if (sql.includes('PRAGMA table_info')) return Promise.resolve([]); // No columns exist
            return Promise.resolve([]);
        });
        const mockGetFirstAsync = jest.fn().mockImplementation((sql) => {
             if (sql.includes('user_version')) return Promise.resolve({ user_version: 2 });
             return Promise.resolve(null);
        });

        requireSqlite.openDatabaseAsync.mockResolvedValue({
            execAsync: mockExecAsync,
            getAllAsync: mockGetAllAsync,
            getFirstAsync: mockGetFirstAsync,
            closeAsync: jest.fn(),
        });

        await initializeDatabase();

        // Verify ALTER TABLE commands were called
        // combined_word_count_details
        for (const col of PREDICTION_COLUMNS) {
            expect(mockExecAsync).toHaveBeenCalledWith(
                expect.stringMatching(new RegExp(`ALTER TABLE combined_word_count_details ADD COLUMN ${col}`, 'i'))
            );
        }

        // portfolio_details
        for (const col of PREDICTION_COLUMNS) {
            expect(mockExecAsync).toHaveBeenCalledWith(
                expect.stringMatching(new RegExp(`ALTER TABLE portfolio_details ADD COLUMN ${col}`, 'i'))
            );
        }

        // Verify version update
        expect(mockExecAsync).toHaveBeenCalledWith(expect.stringMatching(/PRAGMA user_version = 4/));
    });
  });

  describe('Web/LocalStorage Support', () => {
      beforeEach(() => {
         jest.useFakeTimers();
      });

      afterEach(() => {
          jest.useRealTimers();
      });

      it('should accept new prediction fields in upsertCombinedSentiment', async () => {
        // Reset web DB
        await resetWebDatabase();
        const webDb = getWebDatabase();

        const params = [
            'AAPL', '2023-01-01', 0, 0, 0, 'NEUT', 0, 0, 0, '2023-01-01',
            'up', 0.75, // nextDay
            'down', 0.60, // twoWeek
            'up', 0.80  // oneMonth
        ];

        await webDb.runAsync('insert or replace into combined_word_count_details', params);

        // Advance timers to trigger debounce
        jest.runAllTimers();

        // Verify data stored includes new fields
        expect(localStorage.setItem).toHaveBeenCalled();

        // Find the call that saved data
        const calls = (localStorage.setItem as jest.Mock).mock.calls;
        const lastCall = calls[calls.length - 1];
        const storedData = JSON.parse(lastCall[1] as string);

        // Need to check if data.sentiment exists and has AAPL
        expect(storedData.sentiment).toBeDefined();
        expect(storedData.sentiment['AAPL']).toBeDefined();

        const storedRecord = storedData.sentiment['AAPL'][0];

        expect(storedRecord.nextDayDirection).toBe('up');
        expect(storedRecord.nextDayProbability).toBe(0.75);
        expect(storedRecord.oneMonthDirection).toBe('up');
      });

      it('should accept new prediction fields in insertPortfolio', async () => {
        await resetWebDatabase();
        const webDb = getWebDatabase();

        const params = [
            'AAPL', 'up 1%', 'Apple', 'down 2%', 'up 5%',
            'up', 0.6,
            'down', 0.7,
            'up', 0.8
        ];

        await webDb.runAsync('insert or replace into portfolio_details', params);

        // Advance timers
        jest.runAllTimers();

        expect(localStorage.setItem).toHaveBeenCalled();
        const calls = (localStorage.setItem as jest.Mock).mock.calls;
        const lastCall = calls[calls.length - 1];
        const storedData = JSON.parse(lastCall[1] as string);

        const storedRecord = storedData.portfolio['AAPL'];

        expect(storedRecord.nextDayDirection).toBe('up');
        expect(storedRecord.twoWeekDirection).toBe('down');
        expect(storedRecord.oneMonthProbability).toBe(0.8);
      });
  });
});
