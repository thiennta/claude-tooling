import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import type { SpecFile } from '../types.js';

const SEARCH_DIRS = ['docs/specs', '.claude/specs', 'specs', 'docs'];

export async function scanSpecs(
  projectPath: string,
  specPath?: string,
  moduleFilter?: string
): Promise<SpecFile[]> {
  let mdFiles: string[] = [];

  if (specPath) {
    const absPath = path.isAbsolute(specPath) ? specPath : path.join(projectPath, specPath);
    if (fs.existsSync(absPath)) {
      const stat = fs.statSync(absPath);
      if (stat.isFile() && absPath.endsWith('.md')) {
        mdFiles = [absPath];
      } else if (stat.isDirectory()) {
        mdFiles = await fg('**/*.md', { cwd: absPath, absolute: true });
      }
    }
  } else {
    for (const dir of SEARCH_DIRS) {
      const absDir = path.join(projectPath, dir);
      if (fs.existsSync(absDir)) {
        const found = await fg('**/*.md', { cwd: absDir, absolute: true });
        if (found.length > 0) {
          mdFiles = found;
          break;
        }
      }
    }

    if (mdFiles.length === 0) {
      const rootMd = await fg(['*spec*.md', '*PRD*.md', '*requirement*.md'], {
        cwd: projectPath,
        absolute: true,
        caseSensitiveMatch: false,
      });
      mdFiles = rootMd;
    }
  }

  const excluded = ['README', 'CHANGELOG', 'LICENSE', 'CONTRIBUTING'];
  mdFiles = mdFiles.filter(f => {
    const base = path.basename(f, '.md').toUpperCase();
    return !excluded.some(e => base.includes(e));
  });

  const results: SpecFile[] = mdFiles.map(f => ({
    path: f,
    moduleName: path.basename(f, '.md'),
  }));

  if (moduleFilter) {
    return results.filter(r =>
      r.moduleName.toLowerCase().includes(moduleFilter.toLowerCase())
    );
  }

  return results;
}
