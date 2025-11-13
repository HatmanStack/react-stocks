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
      const dataString = JSON.stringify(this.data);
      localStorage.setItem(this.storageKey, dataString);

      // Debug: verify it was saved
      const saved = localStorage.getItem(this.storageKey);
      if (!saved) {
        console.error('[WebDB] CRITICAL: Data did not save to localStorage!');
      } else {
        console.log('[WebDB] ✓ Saved', (dataString.length / 1024).toFixed(1), 'KB');
      }
    } catch (error) {
      console.error('[WebDB] Failed to save data:', error);
      console.error('[WebDB] Error details:', {
        name: (error as Error).name,
        message: (error as Error).message,
        dataSize: JSON.stringify(this.data).length,
        storageKey: this.storageKey
      });
    }
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
      console.log(`[WebDB] Inserting stock: ${ticker} ${date} close=$${close}`);
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
    return this.data.stocks[ticker] || [];
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
    const [date, ticker, positive, negative, sentimentNumber, sentiment, nextDay, twoWks, oneMnth, updateDate] = params;

    if (!this.data.sentiment[ticker]) {
      this.data.sentiment[ticker] = [];
    }

    // Find existing record and update or insert new
    const existingIndex = this.data.sentiment[ticker].findIndex((s) => s.date === date);

    const record = {
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

    if (existingIndex >= 0) {
      this.data.sentiment[ticker][existingIndex] = record;
    } else {
      this.data.sentiment[ticker].push(record);
    }

    this.saveData();
    return { changes: 1 };
  }

  private getSentiment(params: any[]): any[] {
    const ticker = params[0];

    let sentiment = this.data.sentiment[ticker] || [];

    // Filter out any records that look like article sentiment (have hash field)
    // Only return daily aggregated sentiment
    sentiment = sentiment.filter((record) => !record.hasOwnProperty('hash'));

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

    console.log(`[WebDB] Getting article sentiment for ${ticker}: ${validArticles.length} records`);

    return validArticles;
  }

  // Portfolio operations
  private insertPortfolio(params: any[]): any {
    // Parameters: ticker, next, name, wks, mnth (from repository upsert)
    const [ticker, next, name, wks, mnth] = params;

    console.log(`[WebDB] Inserting portfolio: ${ticker}, name: ${name}`);

    this.data.portfolio[ticker] = {
      ticker,
      next: next || '0',
      name: name || ticker,
      wks: wks || '0',
      mnth: mnth || '0',
    };
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
}

export function getDatabase(): WebDatabase {
  if (!webDatabase) {
    throw new Error('[WebDB] Database not initialized. Call initializeDatabase() first.');
  }
  return webDatabase;
}

export async function closeDatabase(): Promise<void> {
  webDatabase = null;
}

export async function resetDatabase(): Promise<void> {
  localStorage.removeItem(`${DB_NAME}_data`);
  webDatabase = new WebDatabase();
}
