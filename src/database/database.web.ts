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

  private saveData(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.data));
    } catch (error) {
      console.error('[WebDB] Failed to save data:', error);
    }
  }

  async runAsync(sql: string, params?: any[]): Promise<any> {
    // Parse SQL and execute appropriate operation
    const sqlLower = sql.toLowerCase().trim();

    if (sqlLower.startsWith('insert into symbols')) {
      return this.insertSymbol(params || []);
    } else if (sqlLower.startsWith('insert into stocks')) {
      return this.insertStock(params || []);
    } else if (sqlLower.startsWith('insert into news')) {
      return this.insertNews(params || []);
    } else if (sqlLower.startsWith('insert into combined_word_details')) {
      return this.insertSentiment(params || []);
    } else if (sqlLower.startsWith('insert into word_count_details')) {
      return this.insertArticleSentiment(params || []);
    } else if (sqlLower.startsWith('insert into portfolio')) {
      return this.insertPortfolio(params || []);
    } else if (sqlLower.includes('delete from portfolio')) {
      return this.deleteFromPortfolio(params || []);
    }

    return { changes: 0 };
  }

  async getAllAsync(sql: string, params?: any[]): Promise<any[]> {
    const sqlLower = sql.toLowerCase().trim();

    if (sqlLower.includes('from symbols')) {
      return this.getSymbols(params || []);
    } else if (sqlLower.includes('from stocks')) {
      return this.getStocks(params || []);
    } else if (sqlLower.includes('from news')) {
      return this.getNews(params || []);
    } else if (sqlLower.includes('from combined_word_details')) {
      return this.getSentiment(params || []);
    } else if (sqlLower.includes('from word_count_details')) {
      return this.getArticleSentiment(params || []);
    } else if (sqlLower.includes('from portfolio')) {
      return this.getPortfolio(params || []);
    }

    return [];
  }

  async getFirstAsync(sql: string, params?: any[]): Promise<any> {
    const results = await this.getAllAsync(sql, params);
    return results[0] || null;
  }

  // Symbol operations
  private insertSymbol(params: any[]): any {
    const [ticker, name, type, currency, exchange] = params;
    this.data.symbols[ticker] = { ticker, name, type, currency, exchange };
    this.saveData();
    return { changes: 1 };
  }

  private getSymbols(params: any[]): any[] {
    if (params.length === 1) {
      // Get specific symbol
      const ticker = params[0];
      const symbol = this.data.symbols[ticker];
      return symbol ? [symbol] : [];
    }
    // Search symbols
    const query = params[0]?.toLowerCase() || '';
    return Object.values(this.data.symbols).filter(
      (s: any) =>
        s.ticker.toLowerCase().includes(query) ||
        s.name?.toLowerCase().includes(query)
    );
  }

  // Stock operations
  private insertStock(params: any[]): any {
    const [ticker, date, open, high, low, close, volume] = params;
    if (!this.data.stocks[ticker]) {
      this.data.stocks[ticker] = [];
    }
    // Check if already exists
    const exists = this.data.stocks[ticker].some(
      (s) => s.date === date
    );
    if (!exists) {
      this.data.stocks[ticker].push({
        ticker,
        date,
        open,
        high,
        low,
        close,
        volume,
      });
    }
    this.saveData();
    return { changes: exists ? 0 : 1 };
  }

  private getStocks(params: any[]): any[] {
    const ticker = params[0];
    return this.data.stocks[ticker] || [];
  }

  // News operations
  private insertNews(params: any[]): any {
    const [ticker, hash, articleUrl, articleDate, articleTitle, snippet] = params;
    if (!this.data.news[ticker]) {
      this.data.news[ticker] = [];
    }
    const exists = this.data.news[ticker].some((n) => n.hash === hash);
    if (!exists) {
      this.data.news[ticker].push({
        ticker,
        hash,
        articleUrl,
        articleDate,
        articleTitle,
        snippet,
      });
    }
    this.saveData();
    return { changes: exists ? 0 : 1 };
  }

  private getNews(params: any[]): any[] {
    const ticker = params[0];
    return this.data.news[ticker] || [];
  }

  // Sentiment operations
  private insertSentiment(params: any[]): any {
    const [ticker, date, positiveScore, negativeScore, neutralScore, compoundScore] = params;
    if (!this.data.sentiment[ticker]) {
      this.data.sentiment[ticker] = [];
    }
    const exists = this.data.sentiment[ticker].some((s) => s.date === date);
    if (!exists) {
      this.data.sentiment[ticker].push({
        ticker,
        date,
        positiveScore,
        negativeScore,
        neutralScore,
        compoundScore,
      });
    }
    this.saveData();
    return { changes: exists ? 0 : 1 };
  }

  private getSentiment(params: any[]): any[] {
    const ticker = params[0];
    return this.data.sentiment[ticker] || [];
  }

  // Article sentiment operations
  private insertArticleSentiment(params: any[]): any {
    const [ticker, hash, date, positiveScore, negativeScore, neutralScore, compoundScore] = params;
    if (!this.data.articleSentiment[ticker]) {
      this.data.articleSentiment[ticker] = [];
    }
    const exists = this.data.articleSentiment[ticker].some((s) => s.hash === hash);
    if (!exists) {
      this.data.articleSentiment[ticker].push({
        ticker,
        hash,
        date,
        positiveScore,
        negativeScore,
        neutralScore,
        compoundScore,
      });
    }
    this.saveData();
    return { changes: exists ? 0 : 1 };
  }

  private getArticleSentiment(params: any[]): any[] {
    const ticker = params[0];
    return this.data.articleSentiment[ticker] || [];
  }

  // Portfolio operations
  private insertPortfolio(params: any[]): any {
    const [ticker, name, addedAt] = params;
    this.data.portfolio[ticker] = { ticker, name, addedAt };
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
  console.log('[WebDB] Initializing localStorage database');
  webDatabase = new WebDatabase();
  console.log('[WebDB] Initialization complete');
}

export function getDatabase(): WebDatabase {
  if (!webDatabase) {
    throw new Error('[WebDB] Database not initialized. Call initializeDatabase() first.');
  }
  return webDatabase;
}

export async function closeDatabase(): Promise<void> {
  webDatabase = null;
  console.log('[WebDB] Database closed');
}

export async function resetDatabase(): Promise<void> {
  console.log('[WebDB] Resetting database');
  localStorage.removeItem(`${DB_NAME}_data`);
  webDatabase = new WebDatabase();
  console.log('[WebDB] Database reset complete');
}
