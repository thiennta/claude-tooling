import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const CLAUDE_DIR = path.join(process.env.USERPROFILE || process.env.HOME || '', '.claude');
const TOKEN_PATH       = path.join(CLAUDE_DIR, 'google-oauth-tokens.json');
const CREDENTIALS_PATH = path.join(CLAUDE_DIR, 'google-client-secret.json');

export async function getAuthClient() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `Không tìm thấy google-client-secret.json tại ${CREDENTIALS_PATH}.\n` +
      `Đặt file client_secret.json vào thư mục repo rồi chạy lại: node setup.js`
    );
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
  const { client_id, client_secret } = credentials.installed;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    'http://localhost:3939/callback'
  );

  if (fs.existsSync(TOKEN_PATH)) {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
    oAuth2Client.setCredentials(tokens);

    // Tự động lưu token mới khi refresh
    oAuth2Client.on('tokens', (newTokens) => {
      const saved = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
      fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...saved, ...newTokens }, null, 2));
    });

    return oAuth2Client;
  }

  return await runFirstTimeAuth(oAuth2Client);
}

async function runFirstTimeAuth(oAuth2Client: InstanceType<typeof google.auth.OAuth2>) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.error('\n🔑 Google Sheets cần xác thực lần đầu.');
  console.error('   Mở link sau trong browser:\n');
  console.error(`   ${authUrl}\n`);

  const code = await waitForAuthCode();

  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);

  fs.mkdirSync(CLAUDE_DIR, { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.error('   ✓ Đã lưu token vào ~/.claude/\n');

  return oAuth2Client;
}

function waitForAuthCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url) return;
      const url  = new URL(req.url, 'http://localhost:3939');
      const code = url.searchParams.get('code');
      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h2>✓ Xác thực thành công! Quay lại terminal.</h2>');
        res.socket?.destroy();
        server.closeAllConnections?.();
        server.close();
        resolve(code);
      }
    });

    server.on('error', reject);
    server.listen(3939);

    // Timeout sau 5 phút
    setTimeout(() => {
      server.close();
      reject(new Error('OAuth timeout — không nhận được auth code sau 5 phút'));
    }, 5 * 60 * 1000);
  });
}
