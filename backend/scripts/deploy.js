const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn, execSync, execFileSync } = require('child_process');

const DEPLOY_CONFIG_PATH = path.join(__dirname, '..', '.deploy-config.json');
const SAM_CONFIG_PATH = path.join(__dirname, '..', 'samconfig.toml');
const FRONTEND_ENV_PATH = path.join(__dirname, '..', '..', '.env');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
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

async function loadOrPromptConfig() {
  let config = {};
  if (fs.existsSync(DEPLOY_CONFIG_PATH)) {
    try {
      config = JSON.parse(fs.readFileSync(DEPLOY_CONFIG_PATH, 'utf8'));
      console.log('Loaded configuration from .deploy-config.json');
    } catch (e) {
      console.warn('Failed to parse .deploy-config.json, prompting for new config.');
    }
  }

  const defaults = {
    region: 'us-east-1',
    stackName: 'stocks-prediction-service',
    lambdaMemory: '1024',
    lambdaTimeout: '120'
  };

  if (!config.region) {
    const input = await question(`Enter AWS Region [${defaults.region}]: `);
    config.region = input.trim() || defaults.region;
  }

  if (!config.stackName) {
    const input = await question(`Enter Stack Name [${defaults.stackName}]: `);
    config.stackName = input.trim() || defaults.stackName;
  }

  if (!config.lambdaMemory) {
    const input = await question(`Enter Lambda Memory (MB) [${defaults.lambdaMemory}]: `);
    config.lambdaMemory = input.trim() || defaults.lambdaMemory;
  }

  if (!config.lambdaTimeout) {
    const input = await question(`Enter Lambda Timeout (seconds) [${defaults.lambdaTimeout}]: `);
    config.lambdaTimeout = input.trim() || defaults.lambdaTimeout;
  }

  fs.writeFileSync(DEPLOY_CONFIG_PATH, JSON.stringify(config, null, 2));
  return config;
}

function generateSamConfig(config) {
  const content = `version = 0.1
[default.deploy.parameters]
stack_name = "${config.stackName}"
region = "${config.region}"
capabilities = "CAPABILITY_IAM"
parameter_overrides = "MemorySize=${config.lambdaMemory} Timeout=${config.lambdaTimeout}"
resolve_s3 = true
`;
  fs.writeFileSync(SAM_CONFIG_PATH, content);
  console.log('Generated samconfig.toml');
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
  // Capture stdout to extract outputs
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

function parseOutputs(output) {
  // Simple regex to find Key=Value pairs from SAM output if possible,
  // but SAM deploy output format is tricky.
  // A better way is to describe the stack after deploy.
  return {};
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

  // Also ensure BACKEND_URL matches if using same API
  let backendFound = false;
   const finalLines = newLines.map(line => {
    if (line.startsWith('EXPO_PUBLIC_BACKEND_URL=')) {
      backendFound = true;
      // If we want to force update backend URL too:
      // return `EXPO_PUBLIC_BACKEND_URL=${apiUrl}`;
      // But let's only update Prediction URL as per plan.
      return line;
    }
    return line;
  });

  // If backend url not set, maybe set it?
  // Phase 2 plan only mentions EXPO_PUBLIC_PREDICTION_API_URL

  // Atomic write: write to temp file first, then rename
  const tmpPath = FRONTEND_ENV_PATH + '.tmp';
  fs.writeFileSync(tmpPath, finalLines.join('\n'));
  fs.renameSync(tmpPath, FRONTEND_ENV_PATH);
  console.log(`Updated frontend .env with API URL: ${apiUrl}`);
}

async function main() {
  await checkPrerequisites();
  const config = await loadOrPromptConfig();
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

  rl.close();
}

main();
