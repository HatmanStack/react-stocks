/**
 * SQL schema definitions for SQLite database
 * Mirrors Android Room database schema
 */

export const CREATE_STOCK_DETAILS_TABLE = `
  CREATE TABLE IF NOT EXISTS stock_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash INTEGER NOT NULL,
    date TEXT NOT NULL,
    ticker TEXT NOT NULL,
    close REAL NOT NULL,
    high REAL NOT NULL,
    low REAL NOT NULL,
    open REAL NOT NULL,
    volume INTEGER NOT NULL,
    adjClose REAL NOT NULL,
    adjHigh REAL NOT NULL,
    adjLow REAL NOT NULL,
    adjOpen REAL NOT NULL,
    adjVolume INTEGER NOT NULL,
    divCash REAL NOT NULL,
    splitFactor REAL NOT NULL,
    marketCap INTEGER NOT NULL,
    enterpriseVal REAL NOT NULL,
    peRatio REAL NOT NULL,
    pbRatio REAL NOT NULL,
    trailingPEG1Y REAL NOT NULL
  );
`;

export const CREATE_SYMBOL_DETAILS_TABLE = `
  CREATE TABLE IF NOT EXISTS symbol_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    longDescription TEXT,
    exchangeCode TEXT,
    name TEXT,
    startDate TEXT,
    ticker TEXT NOT NULL,
    endDate TEXT
  );
`;

export const CREATE_NEWS_DETAILS_TABLE = `
  CREATE TABLE IF NOT EXISTS news_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    ticker TEXT NOT NULL,
    articleTickers TEXT,
    title TEXT,
    articleDate TEXT,
    articleUrl TEXT,
    publisher TEXT,
    ampUrl TEXT,
    articleDescription TEXT
  );
`;

export const CREATE_WORD_COUNT_DETAILS_TABLE = `
  CREATE TABLE IF NOT EXISTS word_count_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    hash INTEGER NOT NULL,
    ticker TEXT NOT NULL,
    positive INTEGER NOT NULL,
    negative INTEGER NOT NULL,
    nextDay REAL NOT NULL,
    twoWks REAL NOT NULL,
    oneMnth REAL NOT NULL,
    body TEXT,
    sentiment TEXT NOT NULL,
    sentimentNumber REAL NOT NULL,
    eventType TEXT,
    aspectScore REAL,
    mlScore REAL,
    materialityScore REAL,
    UNIQUE(ticker, hash)
  );
`;

export const CREATE_COMBINED_WORD_DETAILS_TABLE = `
  CREATE TABLE IF NOT EXISTS combined_word_count_details (
    ticker TEXT NOT NULL,
    date TEXT NOT NULL,
    positive INTEGER NOT NULL,
    negative INTEGER NOT NULL,
    sentimentNumber REAL NOT NULL,
    sentiment TEXT NOT NULL,
    nextDay REAL NOT NULL,
    twoWks REAL NOT NULL,
    oneMnth REAL NOT NULL,
    updateDate TEXT,
    eventCounts TEXT,
    avgAspectScore REAL,
    avgMlScore REAL,
    avgSignalScore REAL,
    materialEventCount INTEGER DEFAULT 0,
    nextDayDirection TEXT,
    nextDayProbability REAL CHECK(nextDayProbability IS NULL OR (nextDayProbability >= 0 AND nextDayProbability <= 1)),
    twoWeekDirection TEXT,
    twoWeekProbability REAL CHECK(twoWeekProbability IS NULL OR (twoWeekProbability >= 0 AND twoWeekProbability <= 1)),
    oneMonthDirection TEXT,
    oneMonthProbability REAL CHECK(oneMonthProbability IS NULL OR (oneMonthProbability >= 0 AND oneMonthProbability <= 1)),
    PRIMARY KEY (ticker, date)
  );
`;

/**
 * Migration: Add Phase 5 multi-signal columns to existing tables
 *
 * ⚠️ WARNING: These raw SQL constants are NOT safe to execute directly!
 * SQLite does not support "ADD COLUMN IF NOT EXISTS". Executing these
 * migrations multiple times will fail with "duplicate column" errors.
 *
 * ACTUAL MIGRATIONS: See database.ts runMigrations() function, which wraps
 * each ALTER TABLE in a columnExists() check for safe re-execution.
 *
 * These constants are kept for documentation purposes only.
 *
 * @see src/database/database.ts:runMigrations for actual implementation
 */
export const MIGRATE_PHASE_5_COLUMNS = `
  -- Add eventCounts column (JSON string)
  ALTER TABLE combined_word_count_details ADD COLUMN eventCounts TEXT;

  -- Add avgAspectScore column (nullable)
  ALTER TABLE combined_word_count_details ADD COLUMN avgAspectScore REAL;

  -- Add avgMlScore column (nullable)
  ALTER TABLE combined_word_count_details ADD COLUMN avgMlScore REAL;

  -- Add avgSignalScore column (nullable)
  ALTER TABLE combined_word_count_details ADD COLUMN avgSignalScore REAL;

  -- Add materialEventCount column (defaults to 0)
  ALTER TABLE combined_word_count_details ADD COLUMN materialEventCount INTEGER DEFAULT 0;
`;

/**
 * Migration: Add Phase 1 prediction fields for direction and probability
 *
 * ⚠️ WARNING: These raw SQL constants are NOT safe to execute directly!
 * SQLite does not support "ADD COLUMN IF NOT EXISTS". Executing these
 * migrations multiple times will fail with "duplicate column" errors.
 *
 * ACTUAL MIGRATIONS: See database.ts runMigrations() function, which wraps
 * each ALTER TABLE in a columnExists() check for safe re-execution.
 *
 * These constants are kept for documentation purposes only.
 *
 * @see src/database/database.ts:runMigrations for actual implementation
 */
export const MIGRATE_PREDICTION_FORMAT_FIELDS = `
  -- Add structured prediction fields to combined_word_count_details
  ALTER TABLE combined_word_count_details ADD COLUMN nextDayDirection TEXT;
  ALTER TABLE combined_word_count_details ADD COLUMN nextDayProbability REAL;
  ALTER TABLE combined_word_count_details ADD COLUMN twoWeekDirection TEXT;
  ALTER TABLE combined_word_count_details ADD COLUMN twoWeekProbability REAL;
  ALTER TABLE combined_word_count_details ADD COLUMN oneMonthDirection TEXT;
  ALTER TABLE combined_word_count_details ADD COLUMN oneMonthProbability REAL;

  -- Add structured prediction fields to portfolio_details
  ALTER TABLE portfolio_details ADD COLUMN nextDayDirection TEXT;
  ALTER TABLE portfolio_details ADD COLUMN nextDayProbability REAL;
  ALTER TABLE portfolio_details ADD COLUMN twoWeekDirection TEXT;
  ALTER TABLE portfolio_details ADD COLUMN twoWeekProbability REAL;
  ALTER TABLE portfolio_details ADD COLUMN oneMonthDirection TEXT;
  ALTER TABLE portfolio_details ADD COLUMN oneMonthProbability REAL;
`;

/**
 * Migration: Add Phase 1 multi-signal fields to word_count_details
 *
 * ⚠️ WARNING: These raw SQL constants are NOT safe to execute directly!
 * SQLite does not support "ADD COLUMN IF NOT EXISTS". Executing these
 * migrations multiple times will fail with "duplicate column" errors.
 *
 * ACTUAL MIGRATIONS: See database.ts runMigrations() function, which wraps
 * each ALTER TABLE in a columnExists() check for safe re-execution.
 *
 * These constants are kept for documentation purposes only.
 *
 * @see src/database/database.ts:runMigrations for actual implementation
 */
export const MIGRATE_PHASE_1_WORD_COUNT_FIELDS = `
  -- Add eventType column (nullable)
  ALTER TABLE word_count_details ADD COLUMN eventType TEXT;

  -- Add aspectScore column (nullable)
  ALTER TABLE word_count_details ADD COLUMN aspectScore REAL;

  -- Add mlScore column (nullable)
  ALTER TABLE word_count_details ADD COLUMN mlScore REAL;

  -- Add materialityScore column (nullable)
  ALTER TABLE word_count_details ADD COLUMN materialityScore REAL;
`;

export const CREATE_PORTFOLIO_DETAILS_TABLE = `
  CREATE TABLE IF NOT EXISTS portfolio_details (
    ticker TEXT PRIMARY KEY NOT NULL,
    next TEXT,
    name TEXT,
    wks TEXT,
    mnth TEXT,
    nextDayDirection TEXT,
    nextDayProbability REAL CHECK(nextDayProbability IS NULL OR (nextDayProbability >= 0 AND nextDayProbability <= 1)),
    twoWeekDirection TEXT,
    twoWeekProbability REAL CHECK(twoWeekProbability IS NULL OR (twoWeekProbability >= 0 AND twoWeekProbability <= 1)),
    oneMonthDirection TEXT,
    oneMonthProbability REAL CHECK(oneMonthProbability IS NULL OR (oneMonthProbability >= 0 AND oneMonthProbability <= 1))
  );
`;

// Indexes for frequently queried columns
export const CREATE_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_stock_ticker ON stock_details(ticker);
  CREATE INDEX IF NOT EXISTS idx_stock_date ON stock_details(date);
  CREATE INDEX IF NOT EXISTS idx_stock_ticker_date ON stock_details(ticker, date);

  CREATE INDEX IF NOT EXISTS idx_symbol_ticker ON symbol_details(ticker);

  CREATE INDEX IF NOT EXISTS idx_news_ticker ON news_details(ticker);
  CREATE INDEX IF NOT EXISTS idx_news_date ON news_details(date);
  CREATE INDEX IF NOT EXISTS idx_news_ticker_date ON news_details(ticker, date);

  CREATE INDEX IF NOT EXISTS idx_word_count_ticker ON word_count_details(ticker);
  CREATE INDEX IF NOT EXISTS idx_word_count_date ON word_count_details(date);
  CREATE INDEX IF NOT EXISTS idx_word_count_hash ON word_count_details(hash);

  CREATE INDEX IF NOT EXISTS idx_combined_ticker ON combined_word_count_details(ticker);
`;

// Array of all table creation statements
export const ALL_TABLES = [
  CREATE_STOCK_DETAILS_TABLE,
  CREATE_SYMBOL_DETAILS_TABLE,
  CREATE_NEWS_DETAILS_TABLE,
  CREATE_WORD_COUNT_DETAILS_TABLE,
  CREATE_COMBINED_WORD_DETAILS_TABLE,
  CREATE_PORTFOLIO_DETAILS_TABLE,
];

// Drop table statements (for testing/development)
export const DROP_ALL_TABLES = `
  DROP TABLE IF EXISTS stock_details;
  DROP TABLE IF EXISTS symbol_details;
  DROP TABLE IF EXISTS news_details;
  DROP TABLE IF EXISTS word_count_details;
  DROP TABLE IF EXISTS combined_word_count_details;
  DROP TABLE IF EXISTS portfolio_details;
`;
