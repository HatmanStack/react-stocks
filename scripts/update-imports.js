#!/usr/bin/env node
/**
 * Import Path Updater
 * Updates all import/require paths after monorepo reorganization
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.sh'];

// Path mappings: old -> new
const PATH_MAPPINGS = [
  // Asset paths in app.json, components
  [/\.\/assets\//g, './frontend/assets/'],
  [/"\.\/assets\//g, '"./frontend/assets/'],

  // Import paths from src/ to frontend/src/
  [/from ['"]\.\.\/src\//g, "from '../frontend/src/"],
  [/from ['"]\.\/src\//g, "from './frontend/src/"],

  // Jest config paths
  [/'<rootDir>\/src\//g, "'<rootDir>/frontend/src/"],
  [/'<rootDir>\/__mocks__\//g, "'<rootDir>/frontend/__mocks__/"],
  [/'<rootDir>\/__tests__\//g, "'<rootDir>/tests/frontend/"],

  // tsconfig paths
  [/"src\/\*"/g, '"frontend/src/*"'],

  // Test import paths
  [/from ['"]\.\.\/\.\.\/src\//g, "from '../../frontend/src/"],
  [/from ['"]\.\.\/\.\.\/\.\.\/src\//g, "from '../../../frontend/src/"],

  // Backend test paths
  [/backend\/__tests__\//g, 'tests/backend/'],
  [/__tests__\/integration\//g, 'tests/frontend/integration/'],
  [/__tests__\/e2e\//g, 'tests/frontend/e2e/'],
];

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    // Skip node_modules, .git, dist, coverage
    if (['node_modules', '.git', 'dist', 'coverage', '.aws-sam', '.expo'].includes(entry.name)) {
      continue;
    }

    if (entry.isDirectory()) {
      walkDir(fullPath, callback);
    } else if (EXTENSIONS.some(ext => entry.name.endsWith(ext))) {
      callback(fullPath);
    }
  }
}

function updateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  for (const [pattern, replacement] of PATH_MAPPINGS) {
    if (pattern.test(content)) {
      content = content.replace(pattern, replacement);
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated: ${path.relative(REPO_ROOT, filePath)}`);
  }
}

console.log('Updating import paths...\n');

walkDir(REPO_ROOT, updateFile);

// Update specific config files
const configUpdates = [
  {
    file: 'frontend/tsconfig.json',
    updates: content => content
      .replace(/"baseUrl": "\."/g, '"baseUrl": "."')
      .replace(/"src\/\*"/g, '"src/*"')  // Keep relative to frontend/
  },
  {
    file: 'frontend/jest.config.js',
    updates: content => content
      .replace(/<rootDir>\/src\//g, '<rootDir>/src/')  // Keep relative
      .replace(/<rootDir>\/__mocks__\//g, '<rootDir>/__mocks__/')
  },
  {
    file: 'frontend/app.json',
    updates: content => content
      .replace(/\.\/assets\//g, './assets/')  // Keep relative to frontend/
  }
];

for (const { file, updates } of configUpdates) {
  const fullPath = path.join(REPO_ROOT, file);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    const updated = updates(content);
    if (content !== updated) {
      fs.writeFileSync(fullPath, updated);
      console.log(`Config updated: ${file}`);
    }
  }
}

console.log('\nImport path updates complete.');
