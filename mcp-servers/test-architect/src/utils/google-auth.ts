import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import open from 'open';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const CLAUDE_DIR = path.join(process.env.USERPROFILE || process.env.HOME || '', '.claude');
const TOKEN_PATH       = path.join(CLAUDE_DIR, 'google-oauth-tokens.json');
const CREDENTIALS_PATH = path.join(CLAUDE_DIR, 'google-client-secret.json');

let reauthServer: http.Server | null = null;

function isInvalidGrant(err: any): boolean {
  const e = err?.response?.data?.error ?? err?.message ?? err;
  return String(e).includes('invalid_grant');
}

// Khi token chết: mở listener nền bắt callback OAuth + trả authUrl để mở browser.
// KHÔNG block — caller ném lỗi kèm URL; user login xong thì token mới được lưu,
// lần chạy lệnh kế tiếp sẽ dùng token mới.
function startReauth(oAuth2Client: InstanceType<typeof google.auth.OAuth2>): string {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt:      'consent',   // ép Google trả refresh_token mới
    scope:       SCOPES,
  });

  if (reauthServer) return authUrl;   // listener đã chạy rồi — tránh EADDRINUSE

  const server = http.createServer(async (req, res) => {
    if (!req.url) return;
    const code = new URL(req.url, 'http://localhost:3939').searchParams.get('code');
    if (!code) return;
    try {
      const { tokens } = await oAuth2Client.getToken(code);
      fs.mkdirSync(CLAUDE_DIR, { recursive: true });
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h2 style="font-family:sans-serif;padding:40px">✓ Đăng nhập thành công! Quay lại và chạy lại lệnh.</h2>');
    } catch (e: any) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Auth error: ' + (e?.message ?? e));
    } finally {
      res.socket?.destroy();
      server.close();
      reauthServer = null;
    }
  });
  server.on('error', () => { reauthServer = null; });
  server.listen(3939);
  reauthServer = server;

  // Tự đóng sau 5 phút nếu không ai login
  setTimeout(() => {
    if (reauthServer === server) { server.close(); reauthServer = null; }
  }, 5 * 60 * 1000);

  return authUrl;
}

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

  // Tự động lưu token mới khi refresh.
  // Guard existsSync: trong luồng re-auth, token cũ đã bị rename .bak — nếu đọc
  // mù sẽ ENOENT. Không có file thì ghi thẳng newTokens.
  oAuth2Client.on('tokens', (newTokens) => {
    const saved = fs.existsSync(TOKEN_PATH)
      ? JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'))
      : {};
    fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...saved, ...newTokens }, null, 2));
  });

  if (fs.existsSync(TOKEN_PATH)) {
    oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8')));

    // Chủ động kiểm tra token còn sống không (refresh nếu access token hết hạn).
    try {
      await oAuth2Client.getAccessToken();
      return oAuth2Client;                       // token còn sống
    } catch (err) {
      if (!isInvalidGrant(err)) throw err;
      // refresh token đã chết → dọn token cũ, rơi xuống luồng re-auth bên dưới
      try { fs.renameSync(TOKEN_PATH, `${TOKEN_PATH}.bak`); } catch { /* ignore */ }
    }
  }

  // Chưa có token, hoặc token đã chết → mở listener + bật browser + ném lỗi kèm URL.
  // KHÔNG block: user login xong (callback lưu token), rồi chạy lại lệnh.
  const authUrl = startReauth(oAuth2Client);
  try { await open(authUrl); } catch { /* headless / không có browser */ }
  throw new Error(
    '⚠ Cần đăng nhập Google Sheets (token chưa có hoặc đã hết hạn). Đã mở browser để đăng nhập.\n' +
    'Nếu browser không tự mở, vào link sau:\n  ' + authUrl + '\n' +
    'Sau khi đăng nhập xong, chạy lại lệnh.'
  );
}
