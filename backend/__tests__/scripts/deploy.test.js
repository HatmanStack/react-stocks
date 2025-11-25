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
const { generateSamConfig, validateConfig } = await import('../../scripts/deploy.js');

describe('Deployment Script', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateConfig', () => {
    it('should validate correct Lambda memory values', () => {
      const config = {
        lambdaMemory: {
          stocks: '512',
          sentiment: '1536'
        }
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject Lambda memory below minimum (128 MB)', () => {
      const config = {
        lambdaMemory: {
          stocks: '64'
        }
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid lambdaMemory.stocks: 64. Must be between 128-10240 MB.');
    });

    it('should reject Lambda memory above maximum (10240 MB)', () => {
      const config = {
        lambdaMemory: {
          stocks: '50000'
        }
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Must be between 128-10240 MB');
    });

    it('should validate correct Lambda timeout values', () => {
      const config = {
        lambdaTimeout: {
          stocks: '30',
          sentiment: '120'
        }
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject Lambda timeout below minimum (1 second)', () => {
      const config = {
        lambdaTimeout: {
          stocks: '0'
        }
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid lambdaTimeout.stocks: 0. Must be between 1-900 seconds.');
    });

    it('should reject Lambda timeout above maximum (900 seconds)', () => {
      const config = {
        lambdaTimeout: {
          stocks: '1000'
        }
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Must be between 1-900 seconds');
    });

    it('should validate multiple fields and return all errors', () => {
      const config = {
        lambdaMemory: {
          stocks: '50000',
          sentiment: '64'
        },
        lambdaTimeout: {
          stocks: '0',
          sentiment: '1000'
        }
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(4);
    });
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
