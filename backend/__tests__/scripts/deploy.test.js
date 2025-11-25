import { jest } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

jest.unstable_mockModule('fs', () => ({
  default: {
    existsSync: jest.fn(() => false),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    renameSync: jest.fn(),
  },
  existsSync: jest.fn(() => false),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  renameSync: jest.fn(),
}));

// We need to import these AFTER mocking
const { generateSamConfig } = await import('../../scripts/deploy.js');

describe('Deployment Script', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateSamConfig', () => {
    it('should generate correct samconfig.toml content with new parameters', () => {
      const config = {
        region: 'us-east-1',
        stackName: 'test-stack',
        lambdaMemory: {
          stocks: '512',
          news: '512',
          search: '256',
          sentiment: '1536',
          predict: '2048'
        },
        lambdaTimeout: {
          stocks: '30',
          news: '30',
          search: '10',
          sentiment: '120',
          predict: '120'
        },
        // enableApiGatewayCaching: true, // Removed
        // apiGatewayCacheSize: '0.5', // Removed
        enableProvisionedConcurrency: false,
        provisionedConcurrency: {
          marketHours: 5,
          preMarket: 2
        }
      };

      const samConfig = generateSamConfig(config);

      // Verify the returned string content
      expect(samConfig).toContain('stack_name = "test-stack"');
      expect(samConfig).toContain('StocksMemory=512');
      expect(samConfig).toContain('PredictTimeout=120');
      // expect(samConfig).toContain('EnableApiGatewayCaching=true'); // Removed
      // expect(samConfig).toContain('ApiGatewayCacheSize=0.5'); // Removed
      expect(samConfig).toContain('EnableCompression=true');
    });

    it('should handle disabled caching (implicitly via compression only)', () => {
      const config = {
        region: 'us-east-1',
        stackName: 'test-stack',
        lambdaMemory: { stocks: '512', news: '512', search: '256', sentiment: '1536', predict: '2048' },
        lambdaTimeout: { stocks: '30', news: '30', search: '10', sentiment: '120', predict: '120' },
        enableProvisionedConcurrency: false,
        provisionedConcurrency: { marketHours: 5, preMarket: 2 }
      };

      const samConfig = generateSamConfig(config);
      expect(samConfig).not.toContain('EnableApiGatewayCaching');
    });
  });
});
