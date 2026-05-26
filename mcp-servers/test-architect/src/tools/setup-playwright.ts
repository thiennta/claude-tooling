import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface PlaywrightSetupResult {
  alreadyInstalled: boolean;
  installedPackage: boolean;
  createdConfig: boolean;
  installedBrowsers: boolean;
  configPath: string;
  errors: string[];
}

export async function setupPlaywright(
  projectPath: string,
  baseURL: string
): Promise<PlaywrightSetupResult> {
  const result: PlaywrightSetupResult = {
    alreadyInstalled: false,
    installedPackage: false,
    createdConfig: false,
    installedBrowsers: false,
    configPath: '',
    errors: [],
  };

  // Check if already installed
  const pkgPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps['@playwright/test'] || deps['playwright']) {
      result.alreadyInstalled = true;
    }
  }

  // Check if node_modules actually exists on disk (package.json alone is not enough)
  const nodeModulesPlaywright = path.join(projectPath, 'node_modules', '@playwright', 'test');

  // Install @playwright/test if missing from package.json
  if (!result.alreadyInstalled) {
    try {
      execSync('npm install --save-dev @playwright/test', {
        cwd: projectPath, stdio: 'pipe', timeout: 120000,
      });
      result.installedPackage = true;
    } catch (e: any) {
      result.errors.push(`npm install failed: ${e.message}`);
      return result;
    }
  } else if (!fs.existsSync(nodeModulesPlaywright)) {
    // In package.json but not on disk — node_modules out of sync, run npm install
    try {
      execSync('npm install', {
        cwd: projectPath, stdio: 'pipe', timeout: 120000,
      });
      result.installedPackage = true;
    } catch (e: any) {
      result.errors.push(`npm install failed: ${e.message}`);
      return result;
    }
  }

  // Create playwright.config.js if not exists
  const configCandidates = ['playwright.config.ts', 'playwright.config.js'];
  const existingConfig = configCandidates.find(c => fs.existsSync(path.join(projectPath, c)));

  if (!existingConfig) {
    const configContent = generatePlaywrightConfig(baseURL);
    const configPath = path.join(projectPath, 'playwright.config.js');
    fs.writeFileSync(configPath, configContent, 'utf-8');
    result.createdConfig = true;
    result.configPath = 'playwright.config.js';
  } else {
    result.configPath = existingConfig;
  }

  // Always ensure generated files are in .gitignore (regardless of whether config was created)
  const gitignorePath = path.join(projectPath, '.gitignore');
  const gitignoreEntries = ['.env.test', 'playwright-report/', 'test-results/'];
  if (fs.existsSync(gitignorePath)) {
    let gitignore = fs.readFileSync(gitignorePath, 'utf-8');
    const toAdd = gitignoreEntries.filter(entry => !gitignore.includes(entry));
    if (toAdd.length > 0) {
      fs.appendFileSync(gitignorePath, '\n' + toAdd.join('\n') + '\n', 'utf-8');
    }
  } else {
    fs.writeFileSync(gitignorePath, gitignoreEntries.join('\n') + '\n', 'utf-8');
  }

  // Install Playwright browsers (chromium only for speed)
  if (!isChromiumInstalled()) {
    try {
      execSync('npx playwright install chromium --with-deps', {
        cwd: projectPath, stdio: 'pipe', timeout: 300000,
      });
      result.installedBrowsers = true;
    } catch {
      try {
        execSync('npx playwright install chromium', {
          cwd: projectPath, stdio: 'pipe', timeout: 300000,
        });
        result.installedBrowsers = true;
      } catch (e: any) {
        result.errors.push(`Browser install failed: ${e.message}`);
      }
    }
  }

  return result;
}

function isChromiumInstalled(): boolean {
  const cacheDir = process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || '', 'ms-playwright')
    : path.join(process.env.HOME || '', '.cache', 'ms-playwright');
  try {
    return fs.existsSync(cacheDir) &&
      fs.readdirSync(cacheDir).some(d => d.startsWith('chromium'));
  } catch {
    return false;
  }
}

function generatePlaywrightConfig(baseURL: string): string {
  return `import { defineConfig } from '@playwright/test'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { resolve, dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(__dirname, '.env.test')
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf-8').split('\\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    if (key) process.env[key] = val
  }
}

export default defineConfig({
  testDir: './e2e',
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']],
  webServer: {
    command: 'npm run dev',
    url: '${baseURL}',
    reuseExistingServer: true,
  },
  use: {
    baseURL: process.env.BASE_URL ?? '${baseURL}',
    trace: 'on',
    screenshot: 'only-on-failure',
    launchOptions: {
      slowMo: process.env.SLOW_MO ? parseInt(process.env.SLOW_MO) : 0,
    },
  },
})
`
}
