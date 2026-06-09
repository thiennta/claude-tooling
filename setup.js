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

// 6. Copy Google OAuth client secret (optional)
const clientSecretSrc  = resolve(__dirname, 'client_secret.json')
const clientSecretDest = resolve(claudeDir, 'google-client-secret.json')

const tokenPath = resolve(claudeDir, 'google-oauth-tokens.json')

if (existsSync(clientSecretSrc)) {
  console.log('[4/5] Configuring Google Sheets OAuth...')
  cpSync(clientSecretSrc, clientSecretDest, { force: true })
  console.log('  ✓ client_secret.json copied to ~/.claude/')

  if (existsSync(tokenPath)) {
    console.log('  ✓ Token đã có — bỏ qua bước login.')
  } else {
    console.log('  Đăng nhập Google để hoàn tất (mở link trong browser)...\n')
    try {
      execSync(
        `node ${resolve(mcpDest, 'dist', 'auth-setup.js')}`,
        { stdio: 'inherit', shell: true }
      )
    } catch {
      console.error('  ✗ Đăng nhập thất bại — chạy lại sau:')
      console.error(`     node ${resolve(mcpDest, 'dist', 'auth-setup.js')}`)
    }
  }
} else {
  console.log('[4/5] Google Sheets OAuth — bỏ qua (client_secret.json không tìm thấy)')
  console.log('  Để dùng --sheet-spec / --sheet-report:')
  console.log('  1. Đặt client_secret.json vào thư mục này')
  console.log('  2. Chạy lại: node setup.js')
}

// 7. Configure Figma Personal Access Token (optional)
const figmaSecretSrc  = resolve(__dirname, 'figma_secret.json')
const figmaTokenPath  = resolve(claudeDir, 'figma-token.json')

if (existsSync(figmaSecretSrc)) {
  console.log('[5/6] Configuring Figma token...')
  cpSync(figmaSecretSrc, figmaTokenPath, { force: true })
  console.log('  ✓ figma_secret.json copied to ~/.claude/figma-token.json')
} else {
  console.log('[5/6] Figma token — bỏ qua (figma_secret.json không tìm thấy)')
  console.log('  Để dùng --figma-spec:')
  console.log('  1. Tạo figma_secret.json với nội dung: { "token": "figd__xxx..." }')
  console.log('  2. Chạy lại: node setup.js')
}

// 8. Register MCP via Claude Code CLI (ghi vào ~/.claude.json đúng cách)
console.log('[6/6] Registering MCP server...')
try {
  execSync(
    `claude mcp add test-architect node "${resolve(mcpDest, 'dist', 'index.js')}" --scope user`,
    { stdio: 'pipe', shell: true }
  )
  console.log('  ✓ Registered via claude mcp add (user scope)')
} catch {
  // Fallback: ghi thẳng vào ~/.claude.json nếu CLI không có
  console.log('  ⚠ claude CLI không tìm thấy — ghi thẳng vào ~/.claude.json')
  const claudeJsonPath = resolve(homeDir, '.claude.json')
  const claudeJson = existsSync(claudeJsonPath)
    ? JSON.parse(readFileSync(claudeJsonPath, 'utf-8'))
    : {}
  claudeJson.mcpServers ??= {}
  claudeJson.mcpServers['test-architect'] = {
    type: 'stdio',
    command: 'node',
    args: [resolve(mcpDest, 'dist', 'index.js')],
    env: {},
  }
  writeFileSync(claudeJsonPath, JSON.stringify(claudeJson, null, 2), 'utf-8')
}

console.log('\n✓ Done! Restart Claude Code to apply changes.')
const hasSheets = existsSync(clientSecretDest)
if (hasSheets) console.log('  Sheets    → OAuth configured ✓')
console.log(`  Commands  → ${resolve(claudeDir, 'commands')}`)
console.log(`  MCP       → ${mcpDest}`)
console.log(`  Config    → ${resolve(homeDir, '.claude.json')}`)
