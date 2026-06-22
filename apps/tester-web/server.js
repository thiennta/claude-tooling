const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const pty = require('node-pty');

const PORT = process.env.PORT || 7800;
const HOST = process.env.HOST || '127.0.0.1';

// Allowlist để chặn Cross-Site WebSocket Hijacking và DNS rebinding
const ALLOWED_ORIGINS = new Set([
  `http://127.0.0.1:${PORT}`,
  `http://localhost:${PORT}`,
]);
const ALLOWED_HOSTS = new Set([
  `127.0.0.1:${PORT}`,
  `localhost:${PORT}`,
]);

function isAllowedOrigin(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGINS.has(origin);
}

function isAllowedHost(host) {
  if (!host) return false;
  return ALLOWED_HOSTS.has(host);
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, verifyClient: ({ req }) => {
  // Chặn Cross-Site WebSocket Hijacking: chỉ chấp nhận request từ origin localhost
  return isAllowedOrigin(req.headers.origin);
}});

// Middleware: reject DNS rebinding — Host header phải là localhost
app.use((req, res, next) => {
  if (!isAllowedHost(req.headers.host)) {
    return res.status(403).send('Forbidden');
  }
  next();
});

// Serve xterm.js từ node_modules
app.use('/xterm', express.static(path.join(__dirname, 'node_modules/@xterm/xterm')));
app.use('/xterm-fit', express.static(path.join(__dirname, 'node_modules/@xterm/addon-fit')));

// Serve public/
app.use(express.static(path.join(__dirname, 'public')));

// Cho client biết server đang chạy trên Windows hay không
app.get('/api/platform', (_req, res) => {
  res.json({ win32: process.platform === 'win32' });
});

// Liệt kê ổ đĩa trên Windows (C:\, D:\, ...)
app.get('/api/drives', (_req, res) => {
  if (process.platform !== 'win32') return res.json({ drives: [] });
  const { execSync } = require('child_process');
  try {
    const out = execSync('wmic logicaldisk get name', { encoding: 'utf8' });
    const drives = out.split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^[A-Z]:$/.test(l))
      .map((l) => l + '\\');
    res.json({ drives });
  } catch {
    res.json({ drives: [] });
  }
});

// API duyệt thư mục — thay cho native folder picker của Electron
app.get('/api/dirs', (req, res) => {
  // Resolve để loại bỏ path traversal (../../etc)
  const reqPath = path.resolve((req.query.path || os.homedir()).trim());
  try {
    const entries = fs.readdirSync(reqPath, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => path.join(reqPath, e.name));
    res.json({ path: reqPath, dirs, parent: path.dirname(reqPath) });
  } catch {
    res.status(400).json({ error: 'Không đọc được thư mục', path: reqPath });
  }
});

// ── WebSocket — mỗi tab = 1 kết nối = 1 PTY ──────────────────────────────

function pickShell() {
  if (process.platform === 'win32') {
    return process.env.COMSPEC && process.env.COMSPEC.toLowerCase().includes('powershell')
      ? process.env.COMSPEC
      : 'powershell.exe';
  }
  return process.env.SHELL || '/bin/bash';
}

wss.on('connection', (ws) => {
  let ptyProc = null;

  function send(obj) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  }

  function killPty() {
    if (ptyProc) {
      try { ptyProc.kill(); } catch (_) {}
      ptyProc = null;
    }
  }

  function spawnPty(cwd) {
    killPty();
    const shell = pickShell();
    const env = { ...process.env, TERM: 'xterm-256color' };

    ptyProc = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: cwd && cwd.trim() ? cwd : os.homedir(),
      env,
    });

    ptyProc.onData((data) => send({ type: 'data', data }));

    ptyProc.onExit(({ exitCode }) => {
      send({ type: 'data', data: `\r\n\x1b[90m[session ended — exit ${exitCode}]\x1b[0m\r\n` });
      send({ type: 'exit', code: exitCode });
      ptyProc = null;
    });
  }

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'run':
        spawnPty(msg.cwd);
        setTimeout(() => {
          if (ptyProc) ptyProc.write(msg.command + '; exit\r');
        }, 400);
        break;

      case 'restart':
        spawnPty(msg.cwd);
        break;

      case 'input':
        if (ptyProc) ptyProc.write(msg.data);
        break;

      case 'resize':
        if (ptyProc && msg.cols > 0 && msg.rows > 0) {
          try { ptyProc.resize(msg.cols, msg.rows); } catch (_) {}
        }
        break;
    }
  });

  ws.on('close', () => killPty());
});

server.listen(PORT, HOST, () => {
  console.log(`AI Test Runner đang chạy tại http://${HOST}:${PORT}`);
  console.log('Mở URL trên trong trình duyệt để bắt đầu.');
});
