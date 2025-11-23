import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { StockHistoricalDataItem, ArticleAnalysisDataItem, DailySentimentAggregateItem } from '../types/dynamodb.types';

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

export class DynamoDBClientWrapper {
  private readonly stockTable: string;
  private readonly articleTable: string;
  private readonly sentimentTable: string;

  constructor() {
    this.stockTable = process.env.STOCK_HISTORICAL_TABLE || '';
    this.articleTable = process.env.ARTICLE_ANALYSIS_TABLE || '';
    this.sentimentTable = process.env.DAILY_SENTIMENT_TABLE || '';

    // Validate that all required table names are configured
    if (!this.stockTable) {
      throw new Error('Missing required environment variable: STOCK_HISTORICAL_TABLE');
    }
    if (!this.articleTable) {
      throw new Error('Missing required environment variable: ARTICLE_ANALYSIS_TABLE');
    }
    if (!this.sentimentTable) {
      throw new Error('Missing required environment variable: DAILY_SENTIMENT_TABLE');
    }
  }

  async putStockData(data: StockHistoricalDataItem): Promise<void> {
    const command = new PutCommand({
      TableName: this.stockTable,
      Item: data,
    });
    await docClient.send(command);
  }

  async getStockData(ticker: string, date: string): Promise<StockHistoricalDataItem | undefined> {
    const command = new GetCommand({
      TableName: this.stockTable,
      Key: { ticker, date },
    });
    const result = await docClient.send(command);
    return result.Item as StockHistoricalDataItem | undefined;
  }

  async queryStockDataByDateRange(ticker: string, startDate: string, endDate: string): Promise<StockHistoricalDataItem[]> {
    const command = new QueryCommand({
      TableName: this.stockTable,
      KeyConditionExpression: 'ticker = :ticker AND #date BETWEEN :startDate AND :endDate',
      ExpressionAttributeNames: {
        '#date': 'date',
      },
      ExpressionAttributeValues: {
        ':ticker': ticker,
        ':startDate': startDate,
        ':endDate': endDate,
      },
    });
    const result = await docClient.send(command);
    return (result.Items || []) as StockHistoricalDataItem[];
  }

  async putArticleAnalysis(data: ArticleAnalysisDataItem): Promise<void> {
    const command = new PutCommand({
      TableName: this.articleTable,
      Item: data,
    });
    await docClient.send(command);
  }

  async queryArticlesByTicker(ticker: string, startDate: string, endDate: string): Promise<ArticleAnalysisDataItem[]> {
    // Note: This query pattern assumes we can scan or that articleHash#date supports this.
    // Since articleHash#date is a composite string, a pure BETWEEN query might be tricky if only prefix matches.
    // However, if the sort key is just the composite string, we might need a GSI or scan if we don't know the hash.
    // But the task says "SortKey: articleHash#date".
    // Actually, if we want to query by date, we usually need a GSI with date as key, OR the sort key starts with date.
    // The plan says "SortKey: articleHash#date". This makes querying by date range for a ticker hard without GSI.
    // Plan also says "GSI (optional): date-based queries".
    // For now, I'll assume we might need to scan or the SortKey is actually date#articleHash which allows range queries.
    // Wait, checking the plan: "SortKey: articleHash#date (STRING, composite)".
    // And "GSI (optional): date-based queries".
    // If I follow the plan exactly, I cannot efficiently query by date range without GSI or changed Sort Key.
    // However, for this implementation, I will implement a query that might filter client side or assume GSI.
    // Let's check the template I created. I didn't add GSI.
    // So I will query by ticker and filter results or just return all for now, assuming volume isn't massive per ticker.
    // Or better, I'll implement it using 'begins_with' if I can, but I can't with hash first.
    // Let's just use Query on Partition Key and filter client side (in Lambda) if needed, or assume we fetch all for the ticker.

    const command = new QueryCommand({
      TableName: this.articleTable,
      KeyConditionExpression: 'ticker = :ticker',
      ExpressionAttributeValues: {
        ':ticker': ticker,
      },
    });

    const result = await docClient.send(command);
    const items = (result.Items || []) as ArticleAnalysisDataItem[];

    // Filter by date range in memory
    return items.filter(item => item.date >= startDate && item.date <= endDate);
  }

  async putDailySentiment(data: DailySentimentAggregateItem): Promise<void> {
    const command = new PutCommand({
      TableName: this.sentimentTable,
      Item: data,
    });
    await docClient.send(command);
  }

  async getDailySentiment(ticker: string, date: string): Promise<DailySentimentAggregateItem | undefined> {
    const command = new GetCommand({
      TableName: this.sentimentTable,
      Key: { ticker, date },
    });
    const result = await docClient.send(command);
    return result.Item as DailySentimentAggregateItem | undefined;
  }
}
