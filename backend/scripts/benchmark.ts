/**
 * Benchmarking Script
 * Measures latency and throughput for different scenarios
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';

// CLI arguments
const args = process.argv.slice(2);
const scenario = args.find(arg => arg.startsWith('--scenario'))?.split('=')[1] || 'all';
const iterations = parseInt(args.find(arg => arg.startsWith('--iterations'))?.split('=')[1] || '10');
const output = args.find(arg => arg.startsWith('--output'))?.split('=')[1] || 'benchmark-results.md';

// Config
const API_URL = process.env.API_URL || 'https://api.example.com'; // Set via env
const TEST_TICKER = 'AAPL';
const TEST_TICKERS = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN', 'NVDA', 'META', 'NFLX', 'AMD', 'INTC'];

interface BenchmarkResult {
  iteration: number;
  duration: number;
}

interface Stats {
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
}

function calculateStats(results: BenchmarkResult[]): Stats {
  const durations = results.map(r => r.duration).sort((a, b) => a - b);
  const sum = durations.reduce((a, b) => a + b, 0);

  return {
    min: durations[0],
    max: durations[durations.length - 1],
    mean: sum / durations.length,
    median: durations[Math.floor(durations.length / 2)],
    p95: durations[Math.floor(durations.length * 0.95)],
    p99: durations[Math.floor(durations.length * 0.99)],
  };
}

async function runBenchmark(scenarioName: string, runFn: () => Promise<void>): Promise<Stats> {
  console.log(`Running scenario: ${scenarioName} (${iterations} iterations)...`);
  const results: BenchmarkResult[] = [];

  for (let i = 0; i < iterations; i++) {
    try {
      const start = Date.now();
      await runFn();
      const duration = Date.now() - start;
      results.push({ iteration: i, duration });
      process.stdout.write('.');
    } catch (error) {
      process.stdout.write('x');
      // console.error(error);
    }
  }
  console.log(''); // Newline

  return calculateStats(results);
}

async function main() {
  console.log(`Starting benchmark suite against ${API_URL}`);

  const scenarios: Record<string, Stats> = {};
  const date = new Date().toISOString().split('T')[0];

  if (scenario === 'all' || scenario === 'single-ticker-cold') {
    // Note: True cold start is hard to force without redeploying or waiting.
    // We simulate "cold cache" by using a random date or assuming first run is cold.
    // But for repeated iterations, only the first might be cold.
    // So this scenario is tricky. We'll label it "Single Ticker" and assume mix.
    scenarios['Single Ticker'] = await runBenchmark('Single Ticker', async () => {
      await axios.get(`${API_URL}/stocks?ticker=${TEST_TICKER}&startDate=${date}`);
    });
  }

  if (scenario === 'all' || scenario === 'batch') {
    scenarios['Batch (10 tickers)'] = await runBenchmark('Batch (10 tickers)', async () => {
      await axios.post(`${API_URL}/batch/stocks`, {
        tickers: TEST_TICKERS,
        startDate: date
      });
    });
  }

  // Generate Markdown Report
  let markdown = `# Benchmark Results\n\n`;
  markdown += `**Date:** ${new Date().toISOString()}\n`;
  markdown += `**Iterations:** ${iterations}\n`;
  markdown += `**API URL:** ${API_URL}\n\n`;

  markdown += `| Scenario | Mean (ms) | Median (ms) | p95 (ms) | p99 (ms) |\n`;
  markdown += `|----------|-----------|-------------|----------|----------|\n`;

  Object.entries(scenarios).forEach(([name, stats]) => {
    markdown += `| ${name} | ${stats.mean.toFixed(0)} | ${stats.median.toFixed(0)} | ${stats.p95.toFixed(0)} | ${stats.p99.toFixed(0)} |\n`;
  });

  fs.writeFileSync(output, markdown);
  console.log(`Results written to ${output}`);
}

main().catch(console.error);
