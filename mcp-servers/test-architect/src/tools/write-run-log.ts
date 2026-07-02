import { mkdirSync, existsSync, appendFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

export interface WriteRunLogResult {
  filePath: string;
  created: boolean;
}

export async function writeRunLog(
  projectPath: string,
  command:     string,
  module:      string,
  date:        string,
  blockName:   string,
  content:     string,
): Promise<WriteRunLogResult> {
  const dir      = resolve(projectPath, 'test-architect-reports');
  const filePath = resolve(dir, `run-log-full_${module}_${date}.md`);
  const timestamp = new Date().toISOString();

  mkdirSync(dir, { recursive: true });

  const created = !existsSync(filePath);
  if (created) {
    const header = [
      `# ${command} — Run Log (Đầy đủ)`,
      '',
      `- Module: ${module}`,
      `- Project: ${projectPath}`,
      `- Started: ${timestamp}`,
      `- Command: ${command}`,
      '',
      '## Steps',
      '',
    ].join('\n');
    writeFileSync(filePath, header, 'utf-8');
  }

  const entry = `\n### [${timestamp}] ${blockName}\n${content}\n`;
  appendFileSync(filePath, entry, 'utf-8');

  return { filePath, created };
}
