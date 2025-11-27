import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { spawn, execSync, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEPLOY_CONFIG_PATH = path.join(__dirname, '..', '.deploy-config.json');
const SAM_CONFIG_PATH = path.join(__dirname, '..', 'samconfig.toml');
const FRONTEND_ENV_PATH = path.join(__dirname, '..', '..', '.env');

export function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

export function question(rl, query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function checkPrerequisites() {
  console.log('Checking prerequisites...');
  try {
    execSync('aws sts get-caller-identity', { stdio: 'ignore' });
  } catch (e) {
    console.error('Error: AWS CLI not configured or missing credentials. Run "aws configure".');
    process.exit(1);
  }

  try {
    execSync('sam --version', { stdio: 'ignore' });
  } catch (e) {
    console.error('Error: SAM CLI not installed.');
    process.exit(1);
  }
}

/**
 * Validate configuration values
 * @param {object} config - Configuration object to validate
 * @returns {object} - { valid: boolean, errors: string[] }
 */
export function validateConfig(config) {
  const errors = [];

  // Validate Lambda memory (128-10240 MB)
  if (config.lambdaMemory) {
    for (const [endpoint, memory] of Object.entries(config.lambdaMemory)) {
      const memoryNum = parseInt(memory, 10);
      if (isNaN(memoryNum) || memoryNum < 128 || memoryNum > 10240) {
        errors.push(`Invalid lambdaMemory.${endpoint}: ${memory}. Must be between 128-10240 MB.`);
      }
    }
  }

  // Validate Lambda timeout (1-900 seconds)
  if (config.lambdaTimeout) {
    for (const [endpoint, timeout] of Object.entries(config.lambdaTimeout)) {
      const timeoutNum = parseInt(timeout, 10);
      if (isNaN(timeoutNum) || timeoutNum < 1 || timeoutNum > 900) {
        errors.push(`Invalid lambdaTimeout.${endpoint}: ${timeout}. Must be between 1-900 seconds.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export async function loadOrPromptConfig(rl) {
  let config = {};
  if (fs.existsSync(DEPLOY_CONFIG_PATH)) {
    try {
      config = JSON.parse(fs.readFileSync(DEPLOY_CONFIG_PATH, 'utf8'));
      console.log('Loaded configuration from .deploy-config.json');

      // Validate loaded config
      const validation = validateConfig(config);
      if (!validation.valid) {
        console.warn('Configuration validation errors:');
        validation.errors.forEach(err => console.warn(`  - ${err}`));
        console.warn('Please fix .deploy-config.json or delete it to re-prompt.');
        process.exit(1);
      }
    } catch (e) {
      console.warn('Failed to parse .deploy-config.json, prompting for new config.');
    }
  }

  // Defaults based on ADRs
  const defaults = {
    region: 'us-east-1',
    stackName: 'stocks-prediction-service',
    enableProvisionedConcurrency: false,
    provisionedConcurrency: {
      marketHours: 5,
      preMarket: 2
    },
    // Per-endpoint configuration
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
    }
  };

  // 1. Basic Config
  if (!config.region) {
    const input = await question(rl, `Enter AWS Region [${defaults.region}]: `);
    config.region = input.trim() || defaults.region;
  }

  if (!config.stackName) {
    const input = await question(rl, `Enter Stack Name [${defaults.stackName}]: `);
    config.stackName = input.trim() || defaults.stackName;
  }

  // 2. API Gateway Caching (Removed - HTTP API doesn't support it)
  // We silently remove the keys if they exist in config to cleanup
  delete config.enableApiGatewayCaching;
  delete config.apiGatewayCacheSize;

  // 3. Provisioned Concurrency (Advanced - defaulted/hidden for now but preserved if present)
  if (config.enableProvisionedConcurrency === undefined) {
      config.enableProvisionedConcurrency = defaults.enableProvisionedConcurrency;
  }
  if (!config.provisionedConcurrency) {
      config.provisionedConcurrency = defaults.provisionedConcurrency;
  }

  // 4. Lambda Configuration (Per Endpoint)
  // Ensure objects exist
  if (!config.lambdaMemory) config.lambdaMemory = {};
  if (!config.lambdaTimeout) config.lambdaTimeout = {};

  // Fill defaults if missing
  for (const [key, value] of Object.entries(defaults.lambdaMemory)) {
      if (!config.lambdaMemory[key]) config.lambdaMemory[key] = value;
  }
  for (const [key, value] of Object.entries(defaults.lambdaTimeout)) {
      if (!config.lambdaTimeout[key]) config.lambdaTimeout[key] = value;
  }

  // Save config
  fs.writeFileSync(DEPLOY_CONFIG_PATH, JSON.stringify(config, null, 2));
  return config;
}

export function generateSamConfig(config) {
  // Build SAM parameter overrides from config
  // Note: API keys are not stored in config for security - SAM will prompt if missing
  const overrides = [
    `StocksMemory=${config.lambdaMemory.stocks}`,
    `StocksTimeout=${config.lambdaTimeout.stocks}`,
    `NewsMemory=${config.lambdaMemory.news}`,
    `NewsTimeout=${config.lambdaTimeout.news}`,
    `SearchMemory=${config.lambdaMemory.search}`,
    `SearchTimeout=${config.lambdaTimeout.search}`,
    `SentimentMemory=${config.lambdaMemory.sentiment}`,
    `SentimentTimeout=${config.lambdaTimeout.sentiment}`,
    `PredictMemory=${config.lambdaMemory.predict}`,
    `PredictTimeout=${config.lambdaTimeout.predict}`,
    `EnableProvisionedConcurrency=${config.enableProvisionedConcurrency}`,
    `ProvisionedConcurrencyMarketHours=${config.provisionedConcurrency.marketHours}`,
    `ProvisionedConcurrencyPreMarket=${config.provisionedConcurrency.preMarket}`
  ];

  // Join overrides with spaces, quoting values if needed (simple implementation)
  const parameterOverrides = overrides.join(' ');

  const content = `version = 0.1
[default.deploy.parameters]
stack_name = "${config.stackName}"
region = "${config.region}"
capabilities = "CAPABILITY_IAM"
parameter_overrides = "${parameterOverrides}"
resolve_s3 = true
`;
  fs.writeFileSync(SAM_CONFIG_PATH, content);
  console.log('Generated samconfig.toml');
  return content; // For testing
}

async function buildAndDeploy() {
  console.log('Building SAM application...');
  try {
    execSync('sam build', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  } catch (e) {
    console.error('Build failed.');
    process.exit(1);
  }

  console.log('Deploying SAM application...');
  return new Promise((resolve, reject) => {
    const deploy = spawn('sam', ['deploy', '--no-confirm-changeset', '--no-fail-on-empty-changeset'], {
      cwd: path.join(__dirname, '..'),
      shell: true
    });

    let stdoutData = '';

    deploy.stdout.on('data', (data) => {
      const str = data.toString();
      process.stdout.write(str);
      stdoutData += str;
    });

    deploy.stderr.on('data', (data) => {
      process.stderr.write(data);
    });

    deploy.on('close', (code) => {
      if (code !== 0) {
        console.error(`Deployment failed with code ${code}`);
        reject(new Error('Deployment failed'));
      } else {
        resolve(stdoutData);
      }
    });
  });
}

async function getStackOutputs(stackName, region) {
    try {
        const result = execFileSync('aws', [
            'cloudformation',
            'describe-stacks',
            '--stack-name',
            stackName,
            '--region',
            region,
            '--query',
            'Stacks[0].Outputs',
            '--output',
            'json'
        ]);
        return JSON.parse(result.toString());
    } catch (e) {
        console.error('Failed to get stack outputs');
        return [];
    }
}

function updateFrontendEnv(apiUrl) {
  let envContent = '';
  if (fs.existsSync(FRONTEND_ENV_PATH)) {
    envContent = fs.readFileSync(FRONTEND_ENV_PATH, 'utf8');
  }

  const lines = envContent.split('\n');
  let found = false;
  const newLines = lines.map(line => {
    if (line.startsWith('EXPO_PUBLIC_PREDICTION_API_URL=')) {
      found = true;
      return `EXPO_PUBLIC_PREDICTION_API_URL=${apiUrl}`;
    }
    return line;
  });

  if (!found) {
    newLines.push(`EXPO_PUBLIC_PREDICTION_API_URL=${apiUrl}`);
  }

  const tmpPath = FRONTEND_ENV_PATH + '.tmp';
  fs.writeFileSync(tmpPath, newLines.join('\n'));
  fs.renameSync(tmpPath, FRONTEND_ENV_PATH);
  console.log(`Updated frontend .env with API URL: ${apiUrl}`);
}

async function main() {
  await checkPrerequisites();
  const rl = createInterface();
  const config = await loadOrPromptConfig(rl);
  rl.close();

  generateSamConfig(config);

  try {
    await buildAndDeploy();
  } catch (e) {
    process.exit(1);
  }

  console.log('Deployment complete. Fetching outputs...');
  const outputs = await getStackOutputs(config.stackName, config.region);
  const apiUrlOutput = outputs.find(o => o.OutputKey === 'ReactStocksApiUrl');

  if (apiUrlOutput) {
    updateFrontendEnv(apiUrlOutput.OutputValue);
  } else {
    console.warn('Could not find ReactStocksApiUrl in stack outputs.');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
