// setup.js — Install claude-tooling on this machine
// Usage: node setup.js
// Works on CMD and PowerShell (Windows), Terminal (macOS/Linux)

import { cpSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const homeDir   = process.env.USERPROFILE || process.env.HOME
const claudeDir = resolve(homeDir, '.claude')
const mcpDest   = resolve(claudeDir, 'mcp-servers', 'test-architect')

// 1. Check prerequisites
if (!homeDir) {
  console.error('ERROR: Cannot determine home directory (USERPROFILE / HOME not set)')
  process.exit(1)
}
try {
  execSync('node --version', { stdio: 'ignore' })
} catch {
  console.error('ERROR: Node.js not found. Install at https://nodejs.org')
  process.exit(1)
}

console.log('Installing claude-tooling...\n')

// 2. Create directories
mkdirSync(resolve(claudeDir, 'commands'),    { recursive: true })
mkdirSync(resolve(claudeDir, 'mcp-servers'), { recursive: true })

// 3. Copy commands
console.log('[1/4] Copying commands...')
cpSync(resolve(__dirname, 'commands'), resolve(claudeDir, 'commands'), {
  recursive: true,
  force: true,
})

// 4. Copy MCP server source (exclude node_modules and dist)
console.log('[2/4] Copying MCP server source...')
cpSync(resolve(__dirname, 'mcp-servers', 'test-architect'), mcpDest, {
  recursive: true,
  force: true,
  filter: (src) => !src.includes('node_modules') && !src.includes(`${__dirname}\\mcp-servers\\test-architect\\dist`) && !src.includes(`${__dirname}/mcp-servers/test-architect/dist`),
})

// 5. Build MCP server
console.log('[3/4] Installing & building MCP server...')
try {
  execSync('npm install && npm run build', { cwd: mcpDest, stdio: 'inherit', shell: true })
} catch {
  console.error('\nERROR: MCP server build failed. settings.json was NOT modified.')
  console.error(`  Fix the error above, then re-run: node setup.js`)
  process.exit(1)
}

// 6. Register MCP in ~/.claude/settings.json
console.log('[4/4] Registering MCP server in settings.json...')
const settingsPath = resolve(claudeDir, 'settings.json')
const settings = existsSync(settingsPath)
  ? JSON.parse(readFileSync(settingsPath, 'utf-8'))
  : {}

settings.mcpServers ??= {}
settings.mcpServers['test-architect'] = {
  command: 'node',
  args: [resolve(mcpDest, 'dist', 'index.js')],
}
writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')

console.log('\n✓ Done! Restart Claude Code to apply changes.')
console.log(`  Commands  → ${resolve(claudeDir, 'commands')}`)
console.log(`  MCP       → ${mcpDest}`)
console.log(`  Settings  → ${settingsPath}`)
