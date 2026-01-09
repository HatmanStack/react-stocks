/**
 * Web database implementation using localStorage
 * Provides same interface as SQLite for cross-platform compatibility
 */

import { DB_NAME } from '@/constants/database.constants';

interface StorageData {
  symbols: Record<string, any>;
  stocks: Record<string, any[]>;
  news: Record<string, any[]>;
  sentiment: Record<string, any[]>;
  articleSentiment: Record<string, any[]>;
  portfolio: Record<string, any>;
}

class WebDatabase {
  private storageKey = `${DB_NAME}_data`;
  private data: StorageData;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private pendingSave = false;

  constructor() {
    this.data = this.loadData();
  }

  private loadData(): StorageData {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('[WebDB] Failed to load data:', error);
    }

    return {
      symbols: {},
      stocks: {},
      news: {},
      sentiment: {},
      articleSentiment: {},
      portfolio: {},
    };
  }

  /**
   * Batched save using requestIdleCallback to avoid blocking the main thread
   * Debounced to 100ms to batch multiple writes together
   */
  private saveData(): void {
    if (this.pendingSave) return;

    this.pendingSave = true;

    // Clear existing timeout
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    // Debounce saves - batch multiple writes
    this.saveTimeout = setTimeout(() => {
      this.performSave();
    }, 100);
  }

  private performSave(): void {
    try {
      const dataString = JSON.stringify(this.data);
      const sizeKB = (dataString.length / 1024).toFixed(1);

      console.log(`[WebDB] Saving ${sizeKB} KB to localStorage...`);

      // Use requestIdleCallback if available, otherwise fallback to immediate save
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
          localStorage.setItem(this.storageKey, dataString);
          console.log(`[WebDB] ✓ Saved ${sizeKB} KB (idle callback)`);
          this.pendingSave = false;
        }, { timeout: 1000 }); // Force save after 1s if browser is busy
      } else {
        localStorage.setItem(this.storageKey, dataString);
        console.log(`[WebDB] ✓ Saved ${sizeKB} KB`);
        this.pendingSave = false;
      }
    } catch (error) {
      console.error('[WebDB] Failed to save data:', error);
      console.error('[WebDB] Error details:', {
        name: (error as Error).name,
        message: (error as Error).message,
        dataSize: JSON.stringify(this.data).length,
        storageKey: this.storageKey
      });
      this.pendingSave = false;
    }
  }

  /**
   * Synchronous save - bypasses debouncing and requestIdleCallback
   * Used during page unload to ensure data is saved immediately
   */
  private performSaveSync(): void {
    try {
      const dataString = JSON.stringify(this.data);
      const sizeKB = (dataString.length / 1024).toFixed(1);

      // Immediately save to localStorage (synchronous)
      localStorage.setItem(this.storageKey, dataString);
      console.log(`[WebDB] ✓ Saved ${sizeKB} KB (sync)`);
      this.pendingSave = false;
    } catch (error) {
      console.error('[WebDB] Failed to save data (sync):', error);
      console.error('[WebDB] Error details:', {
        name: (error as Error).name,
        message: (error as Error).message,
        dataSize: JSON.stringify(this.data).length,
        storageKey: this.storageKey
      });
      this.pendingSave = false;
    }
  }

  /**
   * Force immediate save (called when user leaves page)
   */
  public flushSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    this.performSaveSync();
  }

  async runAsync(sql: string, params?: any[]): Promise<any> {
    // Parse SQL and execute appropriate operation
    const sqlLower = sql.toLowerCase().trim();

    if (sqlLower.startsWith('insert into symbol_details')) {
      console.log('[WebDB] Inserting symbol:', params?.[4]); // ticker is 5th param
      return this.insertSymbol(params || []);
    } else if (sqlLower.startsWith('insert into stock_details')) {
      const ticker = params?.[2];
      const date = params?.[1];
      const close = params?.[3];
      // Debug log disabled - too noisy
      // console.log(`[WebDB] Inserting stock: ${ticker} ${date} close=$${close}`);
      return this.insertStock(params || []);
    } else if (sqlLower.startsWith('insert into news_details')) {
      console.log('[WebDB] Inserting news:', params?.[0]); // ticker
      return this.insertNews(params || []);
    } else if (sqlLower.startsWith('insert or replace into combined_word_count_details')) {
      return this.upsertCombinedSentiment(params || []);
    } else if (sqlLower.startsWith('insert into word_count_details')) {
      return this.insertArticleSentiment(params || []);
    } else if (sqlLower.startsWith('insert or replace into portfolio_details')) {
      return this.insertPortfolio(params || []);
    } else if (sqlLower.startsWith('insert into portfolio_details')) {
      return this.insertPortfolio(params || []);
    } else if (sqlLower.includes('delete from portfolio')) {
      return this.deleteFromPortfolio(params || []);
    } else {
      console.warn('[WebDB] Unhandled SQL:', sqlLower.substring(0, 50));
    }

    return { changes: 0 };
  }

  async getAllAsync(sql: string, params?: any[]): Promise<any[]> {
    const sqlLower = sql.toLowerCase().trim();

    if (sqlLower.includes('from symbol_details')) {
      return this.getSymbols(params || []);
    } else if (sqlLower.includes('from stock_details')) {
      return this.getStocks(params || []);
    } else if (sqlLower.includes('from news_details')) {
      return this.getNews(params || []);
    } else if (sqlLower.includes('from combined_word_count_details')) {
      return this.getSentiment(params || []);
    } else if (sqlLower.includes('from word_count_details')) {
      return this.getArticleSentiment(params || []);
    } else if (sqlLower.includes('from portfolio_details')) {
      return this.getPortfolio(params || []);
    } else {
      console.warn('[WebDB] Unhandled SELECT SQL:', sqlLower.substring(0, 80));
    }

    return [];
  }

  async getFirstAsync(sql: string, params?: any[]): Promise<any> {
    const results = await this.getAllAsync(sql, params);
    return results[0] || null;
  }

  /**
   * Execute a transaction (web implementation just runs the callback)
   * localStorage operations are atomic, so no real transaction needed
   */
  async withTransactionAsync(callback: () => Promise<void>): Promise<void> {
    await callback();
  }

  /**
   * Execute raw SQL (for native compatibility)
   * Web implementation: Handles DDL statements (CREATE TABLE, ALTER TABLE, PRAGMA)
   * Most DDL is a no-op since schema is implicit in JSON structure
   */
  async execAsync(sql: string): Promise<void> {
    const sqlLower = sql.toLowerCase().trim();

    // Handle common DDL patterns
    if (sqlLower.startsWith('pragma')) {
      // PRAGMA statements are no-ops in web implementation
      console.log('[WebDB] PRAGMA (no-op):', sql.substring(0, 50));
      return;
    }

    if (sqlLower.startsWith('create table') || sqlLower.startsWith('create index')) {
      // Table/index creation is implicit in our JSON structure
      console.log('[WebDB] CREATE (no-op):', sql.substring(0, 50));
      return;
    }

    if (sqlLower.startsWith('alter table')) {
      // Schema changes handled by JSON structure evolution
      console.log('[WebDB] ALTER TABLE (no-op):', sql.substring(0, 50));
      return;
    }

    if (sqlLower.startsWith('drop table')) {
      // Handle table drops by clearing data
      const match = sql.match(/drop table if exists (\w+)/i) || sql.match(/drop table (\w+)/i);
      if (match) {
        const tableName = match[1];
        console.log(`[WebDB] DROP TABLE: ${tableName}`);
        // Map table names to data structure keys
        if (tableName === 'symbol_details') this.data.symbols = {};
        else if (tableName === 'stock_details') this.data.stocks = {};
        else if (tableName === 'news_details') this.data.news = {};
        else if (tableName === 'combined_word_count_details') this.data.sentiment = {};
        else if (tableName === 'word_count_details') this.data.articleSentiment = {};
        else if (tableName === 'portfolio_details') this.data.portfolio = {};
        this.saveData();
      }
      return;
    }

    console.warn('[WebDB] Unhandled execAsync SQL:', sql.substring(0, 80));
  }

  // Symbol operations
  private insertSymbol(params: any[]): any {
    const [longDescription, exchangeCode, name, startDate, ticker, endDate] = params;

    // Check if symbol already exists
    if (this.data.symbols[ticker]) {
      return { changes: 0 };
    }

    this.data.symbols[ticker] = { ticker, name, exchangeCode, longDescription, startDate, endDate };
    this.saveData();
    return { changes: 1 };
  }

  private getSymbols(params: any[]): any[] {
    if (params.length === 1) {
      // Get specific symbol by ticker
      const ticker = params[0];
      const symbol = this.data.symbols[ticker];
      return symbol ? [symbol] : [];
    }
    // Get all symbols (no params) or search
    return Object.values(this.data.symbols);
  }

  // Stock operations
  private insertStock(params: any[]): any {
    const [
      hash, date, ticker, close, high, low, open, volume,
      adjClose, adjHigh, adjLow, adjOpen, adjVolume,
      divCash, splitFactor, marketCap, enterpriseVal,
      peRatio, pbRatio, trailingPEG1Y
    ] = params;

    if (!this.data.stocks[ticker]) {
      this.data.stocks[ticker] = [];
    }

    // Check if already exists
    const exists = this.data.stocks[ticker].some(
      (s) => s.date === date
    );

    if (!exists) {
      this.data.stocks[ticker].push({
        hash,
        date,
        ticker,
        close,
        high,
        low,
        open,
        volume,
        adjClose,
        adjHigh,
        adjLow,
        adjOpen,
        adjVolume,
        divCash,
        splitFactor,
        marketCap,
        enterpriseVal,
        peRatio,
        pbRatio,
        trailingPEG1Y,
      });
    }

    this.saveData();
    return { changes: exists ? 0 : 1 };
  }

  private getStocks(params: any[]): any[] {
    const ticker = params[0];
    let stocks = this.data.stocks[ticker] || [];

    // If date range params provided, filter by date
    if (params.length === 3) {
      const startDate = params[1];
      const endDate = params[2];
      stocks = stocks.filter(
        (stock) => stock.date >= startDate && stock.date <= endDate
      );
    }

    return stocks;
  }

  // News operations
  private insertNews(params: any[]): any {
    const [date, ticker, articleTickers, title, articleDate, articleUrl, publisher, ampUrl, articleDescription] = params;

    if (!this.data.news[ticker]) {
      this.data.news[ticker] = [];
    }

    // Check if article already exists by URL
    const exists = this.data.news[ticker].some((n) => n.articleUrl === articleUrl);

    if (!exists) {
      this.data.news[ticker].push({
        date,
        ticker,
        articleTickers,
        title,
        articleDate,
        articleUrl,
        publisher,
        ampUrl,
        articleDescription,
      });
    }

    this.saveData();
    return { changes: exists ? 0 : 1 };
  }

  private getNews(params: any[]): any[] {
    const ticker = params[0];

    console.log(`[WebDB] getNews called with params:`, params);
    console.log(`[WebDB] Available tickers in news:`, Object.keys(this.data.news));

    let news = this.data.news[ticker] || [];

    // If date range params provided, filter by articleDate
    if (params.length === 3) {
      const startDate = params[1];
      const endDate = params[2];
      news = news.filter(
        (article) =>
          article.articleDate >= startDate && article.articleDate <= endDate
      );
      console.log(`[WebDB] Getting news for ${ticker} from ${startDate} to ${endDate}: ${news.length} articles`);
    } else {
      console.log(`[WebDB] Getting all news for ${ticker}: ${news.length} articles`);
    }

    if (news.length > 0) {
      console.log(`[WebDB] Sample articles:`, news.slice(0, 2).map(a => ({ ticker: a.ticker, date: a.articleDate, title: a.title?.substring(0, 40) })));
    }

    return news;
  }

  // Combined sentiment operations (daily aggregated)
  private upsertCombinedSentiment(params: any[]): any {
    // params length depends on schema version. Basic is 10 params.
    // For this simple implementation, we assume standard params or handle extension via repository logic
    // The repository constructs the SQL. For localStorage we need to map params to object properties.
    // But wait, the params array comes from `runAsync`. We need to know which param is which.
    // The current implementation assumes fixed param order:
    // ticker, date, positive, negative, sentimentNumber, sentiment, nextDay, twoWks, oneMnth, updateDate

    // If more params are passed (e.g. prediction fields), we need to handle them.
    // However, standard repository inserts usually name columns. `runAsync` here receives just values array?
    // No, typically `runAsync` takes SQL + params.
    // But here `upsertCombinedSentiment` takes `params` array.
    // The caller `runAsync` just passes `params`.
    // This implementation relies on knowing the param order which is fragile if SQL changes.
    // For now, we assume the repository passes basic params first.

    const [ticker, date, positive, negative, sentimentNumber, sentiment, nextDay, twoWks, oneMnth, updateDate,
           nextDayDirection, nextDayProbability,
           twoWeekDirection, twoWeekProbability,
           oneMonthDirection, oneMonthProbability] = params;

    if (!this.data.sentiment[ticker]) {
      this.data.sentiment[ticker] = [];
    }

    // Find existing record and update or insert new
    const existingIndex = this.data.sentiment[ticker].findIndex((s) => s.date === date);

    const record: any = {
      date,
      ticker,
      positive,
      negative,
      sentimentNumber,
      sentiment,
      nextDay,
      twoWks,
      oneMnth,
      updateDate,
    };

    // Add prediction fields if present
    if (nextDayDirection !== undefined) record.nextDayDirection = nextDayDirection;
    if (nextDayProbability !== undefined) record.nextDayProbability = nextDayProbability;
    if (twoWeekDirection !== undefined) record.twoWeekDirection = twoWeekDirection;
    if (twoWeekProbability !== undefined) record.twoWeekProbability = twoWeekProbability;
    if (oneMonthDirection !== undefined) record.oneMonthDirection = oneMonthDirection;
    if (oneMonthProbability !== undefined) record.oneMonthProbability = oneMonthProbability;

    if (existingIndex >= 0) {
      // Preserve other fields if they exist (e.g. Phase 5 fields not in basic params)
      const existing = this.data.sentiment[ticker][existingIndex];
      this.data.sentiment[ticker][existingIndex] = { ...existing, ...record };
    } else {
      this.data.sentiment[ticker].push(record);
    }

    this.saveData();
    return { changes: 1 };
  }

  private getSentiment(params: any[]): any[] {
    const ticker = params[0];

    let sentiment = this.data.sentiment[ticker] || [];

    // If date range params provided, filter by date
    if (params.length === 3) {
      const startDate = params[1];
      const endDate = params[2];
      sentiment = sentiment.filter(
        (record) => record.date >= startDate && record.date <= endDate
      );
    }

    console.log(`[WebDB] Getting daily aggregate sentiment for ${ticker}: ${sentiment.length} records`);

    return sentiment;
  }

  // Article sentiment operations
  private insertArticleSentiment(params: any[]): any {
    // Parameters: date, hash, ticker, positive, negative, nextDay, twoWks, oneMnth, body, sentiment, sentimentNumber
    const [date, hash, ticker, positive, negative, nextDay, twoWks, oneMnth, body, sentiment, sentimentNumber] = params;

    if (!this.data.articleSentiment[ticker]) {
      this.data.articleSentiment[ticker] = [];
    }

    // Ensure hash is a number
    const hashNum = typeof hash === 'number' ? hash : parseInt(hash);

    const exists = this.data.articleSentiment[ticker].some((s) => s.hash === hashNum);
    if (!exists) {
      this.data.articleSentiment[ticker].push({
        ticker,
        hash: hashNum,
        date,
        positive: parseInt(positive),
        negative: parseInt(negative),
        nextDay: parseFloat(nextDay),
        twoWks: parseFloat(twoWks),
        oneMnth: parseFloat(oneMnth),
        body,
        sentiment,
        sentimentNumber: parseFloat(sentimentNumber),
      });
    }
    this.saveData();
    return { changes: exists ? 0 : 1 };
  }

  private getArticleSentiment(params: any[]): any[] {
    const ticker = params[0];
    const articles = this.data.articleSentiment[ticker] || [];

    // Filter to only return records with hash field (article-level data)
    const validArticles = articles.filter((record) => record.hasOwnProperty('hash') && typeof record.hash === 'number');

    // Debug log disabled - too noisy
    // console.log(`[WebDB] Getting article sentiment for ${ticker}: ${validArticles.length} records`);

    return validArticles;
  }

  // Portfolio operations
  private insertPortfolio(params: any[]): any {
    // Parameters: ticker, next, name, wks, mnth (from repository upsert)
    // Extended params: ..., nextDayDirection, nextDayProbability, etc.
    const [ticker, next, name, wks, mnth,
           nextDayDirection, nextDayProbability,
           twoWeekDirection, twoWeekProbability,
           oneMonthDirection, oneMonthProbability] = params;

    console.log(`[WebDB] Inserting portfolio: ${ticker}, name: ${name}`);

    const record: any = {
      ticker,
      next: next || '0',
      name: name || ticker,
      wks: wks || '0',
      mnth: mnth || '0',
    };

    // Add prediction fields if present
    if (nextDayDirection !== undefined) record.nextDayDirection = nextDayDirection;
    if (nextDayProbability !== undefined) record.nextDayProbability = nextDayProbability;
    if (twoWeekDirection !== undefined) record.twoWeekDirection = twoWeekDirection;
    if (twoWeekProbability !== undefined) record.twoWeekProbability = twoWeekProbability;
    if (oneMonthDirection !== undefined) record.oneMonthDirection = oneMonthDirection;
    if (oneMonthProbability !== undefined) record.oneMonthProbability = oneMonthProbability;

    // Merge with existing to preserve other fields
    const existing = this.data.portfolio[ticker] || {};
    this.data.portfolio[ticker] = { ...existing, ...record };

    this.saveData();
    return { changes: 1 };
  }

  private deleteFromPortfolio(params: any[]): any {
    const ticker = params[0];
    if (this.data.portfolio[ticker]) {
      delete this.data.portfolio[ticker];
      this.saveData();
      return { changes: 1 };
    }
    return { changes: 0 };
  }

  private getPortfolio(params: any[]): any[] {
    if (params.length === 1) {
      // Get specific portfolio item
      const ticker = params[0];
      const item = this.data.portfolio[ticker];
      return item ? [item] : [];
    }
    // Get all portfolio items
    return Object.values(this.data.portfolio);
  }
}

// Singleton instance
let webDatabase: WebDatabase | null = null;

export async function initializeDatabase(): Promise<void> {
  webDatabase = new WebDatabase();

  // Flush saves when user navigates away or closes page
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      if (webDatabase) {
        console.log('[WebDB] Page unload - flushing pending saves');
        webDatabase.flushSave();
      }
    });

    // Also flush on visibility change (tab switching)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && webDatabase) {
        console.log('[WebDB] Tab hidden - flushing pending saves');
        webDatabase.flushSave();
      }
    });
  }
}

export function getDatabase(): WebDatabase {
  if (!webDatabase) {
    throw new Error('[WebDB] Database not initialized. Call initializeDatabase() first.');
  }
  return webDatabase;
}

export async function closeDatabase(): Promise<void> {
  if (webDatabase) {
    webDatabase.flushSave();
  }
  webDatabase = null;
}

export async function resetDatabase(): Promise<void> {
  localStorage.removeItem(`${DB_NAME}_data`);
  webDatabase = new WebDatabase();
}
