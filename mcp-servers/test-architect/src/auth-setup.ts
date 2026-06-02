// Chạy một lần để setup Google OAuth token
// Usage: node dist/auth-setup.js

import { google }   from 'googleapis';
import * as fs      from 'fs';
import * as path    from 'path';
import * as http    from 'http';
import * as readline from 'readline';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const CLAUDE_DIR       = path.join(process.env.USERPROFILE || process.env.HOME || '', '.claude');
const TOKEN_PATH       = path.join(CLAUDE_DIR, 'google-oauth-tokens.json');
const CREDENTIALS_PATH = path.join(CLAUDE_DIR, 'google-client-secret.json');

async function main() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error(`\n✗ Không tìm thấy: ${CREDENTIALS_PATH}`);
    console.error('  Đặt client_secret.json vào thư mục repo rồi chạy: node setup.js\n');
    process.exit(1);
  }

  if (fs.existsSync(TOKEN_PATH)) {
    console.log('\n✓ Google Sheets đã được xác thực rồi.');
    console.log(`  Token: ${TOKEN_PATH}\n`);
    process.exit(0);
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
  const { client_id, client_secret } = credentials.installed;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    'http://localhost:3939/callback'
  );

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('\n════════════════════════════════════════════');
  console.log('  Google Sheets — Xác thực lần đầu');
  console.log('════════════════════════════════════════════');
  console.log('\n  Mở link sau trong browser:\n');
  console.log(`  ${authUrl}\n`);
  console.log('  Đăng nhập Google → cho phép quyền');
  console.log('  → Browser sẽ redirect về localhost:3939');
  console.log('════════════════════════════════════════════\n');

  const code = await waitForAuthCode();

  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);

  fs.mkdirSync(CLAUDE_DIR, { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

  console.log('\n✓ Xác thực thành công!');
  console.log(`  Token lưu tại: ${TOKEN_PATH}`);
  console.log('  Giờ có thể dùng --sheet-spec / --sheet-report\n');
  process.exit(0);
}

function waitForAuthCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url) return;
      const url  = new URL(req.url, 'http://localhost:3939');
      const code = url.searchParams.get('code');
      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h2 style="font-family:sans-serif;padding:40px">✓ Xác thực thành công! Quay lại terminal.</h2>');
        res.socket?.destroy();
        server.closeAllConnections?.();
        server.close();
        resolve(code);
      }
    });

    server.on('error', reject);
    server.listen(3939, () => {
      console.log('  Đang chờ callback tại http://localhost:3939 ...\n');
    });

    setTimeout(() => {
      server.close();
      reject(new Error('Timeout sau 5 phút — chạy lại script để thử lại'));
    }, 5 * 60 * 1000);
  });
}

main().catch(err => {
  console.error('\n✗ Lỗi:', err.message);
  process.exit(1);
});
