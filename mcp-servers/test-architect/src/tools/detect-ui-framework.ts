import * as fs from 'fs';
import * as path from 'path';
import type { FrameworkInfo } from '../types.js';

export async function detectUiFramework(projectPath: string): Promise<FrameworkInfo> {
  const packageJsonPath = path.join(projectPath, 'package.json');
  const composerPath = path.join(projectPath, 'composer.json');
  const requirementsPath = path.join(projectPath, 'requirements.txt');
  const gemfilePath = path.join(projectPath, 'Gemfile');

  if (fs.existsSync(packageJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const info = detectFromPackageJson(pkg);

    if (fs.existsSync(composerPath)) {
      const composer = JSON.parse(fs.readFileSync(composerPath, 'utf-8'));
      if (composer.require?.['laravel/framework']) {
        return {
          ...info,
          framework: 'laravel+' + info.framework,
          uiType: 'spa',
          configFile: 'package.json + composer.json',
        };
      }
    }
    return info;
  }

  if (fs.existsSync(composerPath)) {
    const composer = JSON.parse(fs.readFileSync(composerPath, 'utf-8'));
    return detectFromComposer(composer);
  }

  if (fs.existsSync(requirementsPath)) {
    return detectFromRequirements(fs.readFileSync(requirementsPath, 'utf-8'));
  }

  if (fs.existsSync(gemfilePath)) {
    return {
      framework: 'rails', version: 'unknown', language: 'ruby',
      uiType: 'server-rendered', devCommand: 'rails server',
      baseURL: 'http://localhost:3000', configFile: 'Gemfile', hasPlaywright: false,
    };
  }

  return {
    framework: 'unknown', version: 'unknown', language: 'unknown',
    uiType: 'unknown', devCommand: '', baseURL: 'http://localhost:3000',
    configFile: '', hasPlaywright: false,
  };
}

function detectFromPackageJson(pkg: any): FrameworkInfo {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const hasPlaywright = !!(deps['@playwright/test'] || deps['playwright']);
  const devCmd = pkg.scripts?.dev || pkg.scripts?.start || 'npm run dev';

  if (deps['nuxt']) return {
    framework: 'nuxt', version: deps['nuxt'], language: 'typescript',
    uiType: 'ssr', devCommand: devCmd, baseURL: 'http://localhost:3000',
    configFile: 'package.json', hasPlaywright,
  };

  if (deps['next']) return {
    framework: 'nextjs', version: deps['next'], language: 'typescript',
    uiType: 'ssr', devCommand: devCmd, baseURL: 'http://localhost:3000',
    configFile: 'package.json', hasPlaywright,
  };

  if (deps['@angular/core']) return {
    framework: 'angular', version: deps['@angular/core'], language: 'typescript',
    uiType: 'spa', devCommand: pkg.scripts?.start || 'ng serve',
    baseURL: 'http://localhost:4200', configFile: 'package.json', hasPlaywright,
  };

  if (deps['vue'] && !deps['nuxt']) return {
    framework: 'vue', version: deps['vue'], language: 'typescript',
    uiType: 'spa', devCommand: devCmd, baseURL: 'http://localhost:5173',
    configFile: 'package.json', hasPlaywright,
  };

  if (deps['react'] && !deps['next']) return {
    framework: 'react', version: deps['react'], language: 'typescript',
    uiType: 'spa', devCommand: devCmd, baseURL: 'http://localhost:3000',
    configFile: 'package.json', hasPlaywright,
  };

  return {
    framework: 'node', version: pkg.version || 'unknown', language: 'javascript',
    uiType: 'unknown', devCommand: devCmd, baseURL: 'http://localhost:3000',
    configFile: 'package.json', hasPlaywright,
  };
}

function detectFromComposer(composer: any): FrameworkInfo {
  if (composer.require?.['laravel/framework']) return {
    framework: 'laravel', version: composer.require['laravel/framework'],
    language: 'php', uiType: 'server-rendered',
    devCommand: 'php artisan serve', baseURL: 'http://localhost:8000',
    configFile: 'composer.json', hasPlaywright: false,
  };

  return {
    framework: 'php', version: 'unknown', language: 'php',
    uiType: 'server-rendered', devCommand: 'php -S localhost:8000',
    baseURL: 'http://localhost:8000', configFile: 'composer.json', hasPlaywright: false,
  };
}

function detectFromRequirements(content: string): FrameworkInfo {
  const lower = content.toLowerCase();
  if (lower.includes('django')) return {
    framework: 'django', version: 'unknown', language: 'python',
    uiType: 'server-rendered', devCommand: 'python manage.py runserver',
    baseURL: 'http://localhost:8000', configFile: 'requirements.txt', hasPlaywright: false,
  };
  if (lower.includes('fastapi')) return {
    framework: 'fastapi', version: 'unknown', language: 'python',
    uiType: 'server-rendered', devCommand: 'uvicorn main:app --reload',
    baseURL: 'http://localhost:8000', configFile: 'requirements.txt', hasPlaywright: false,
  };
  if (lower.includes('flask')) return {
    framework: 'flask', version: 'unknown', language: 'python',
    uiType: 'server-rendered', devCommand: 'flask run',
    baseURL: 'http://localhost:5000', configFile: 'requirements.txt', hasPlaywright: false,
  };
  return {
    framework: 'python', version: 'unknown', language: 'python',
    uiType: 'server-rendered', devCommand: 'python app.py',
    baseURL: 'http://localhost:5000', configFile: 'requirements.txt', hasPlaywright: false,
  };
}
