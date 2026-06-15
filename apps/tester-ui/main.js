const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const os = require('os');
const pty = require('@homebridge/node-pty-prebuilt-multiarch');

let win = null;
let ptyProc = null;

// Pick a shell that exists on this machine. We launch `claude` from inside it,
// so it just needs to be a real interactive shell with claude on PATH.
function pickShell() {
  if (process.platform === 'win32') {
    return process.env.COMSPEC && process.env.COMSPEC.toLowerCase().includes('powershell')
      ? process.env.COMSPEC
      : 'powershell.exe';
  }
  return process.env.SHELL || '/bin/bash';
}

function killPty() {
  if (ptyProc) {
    try { ptyProc.kill(); } catch (_) { /* already gone */ }
    ptyProc = null;
  }
}

// (Re)spawn a PTY in the given working directory and stream its output to the
// renderer. A real PTY is what lets Claude Code's interactive TUI / checkpoints
// render correctly — a plain piped stdout would break them.
function spawnPty(cwd) {
  killPty();
  const shell = pickShell();
  const env = { ...process.env };
  // Force a UTF-8, color-capable terminal so the TUI renders cleanly.
  env.TERM = 'xterm-256color';
  // Must not leak into the child shell — it would make `claude` (and node) run
  // as plain Node instead of normally. Strip it so the embedded terminal behaves
  // like a real user terminal regardless of how this app was launched.
  delete env.ELECTRON_RUN_AS_NODE;

  ptyProc = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: cwd && cwd.trim() ? cwd : os.homedir(),
    env,
  });

  ptyProc.onData((data) => {
    if (win && !win.isDestroyed()) win.webContents.send('pty:data', data);
  });

  ptyProc.onExit(({ exitCode }) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('pty:data', `\r\n\x1b[90m[session ended — exit ${exitCode}]\x1b[0m\r\n`);
    }
    ptyProc = null;
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 800,
    title: 'AI Test Runner',
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.removeMenu();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // win.webContents.openDevTools();
}

// ── IPC ───────────────────────────────────────────────────────────────────

// Native folder picker for the Project field.
ipcMain.handle('dialog:pickFolder', async (_e, current) => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Chọn thư mục project cần test',
    properties: ['openDirectory'],
    defaultPath: current && current.trim() ? current : undefined,
  });
  return res.canceled || !res.filePaths.length ? null : res.filePaths[0];
});

// Keystrokes typed in the embedded terminal → PTY stdin.
ipcMain.on('pty:input', (_e, data) => {
  if (ptyProc) ptyProc.write(data);
});

ipcMain.on('pty:resize', (_e, { cols, rows }) => {
  if (ptyProc && cols > 0 && rows > 0) {
    try { ptyProc.resize(cols, rows); } catch (_) { /* race on teardown */ }
  }
});

// Form "Run" → fresh PTY in the chosen project dir, then submit the claude command.
ipcMain.on('session:run', (_e, { cwd, command }) => {
  spawnPty(cwd);
  // Give the shell a beat to initialize before sending the command.
  setTimeout(() => {
    if (ptyProc) ptyProc.write(command + '\r');
  }, 400);
});

ipcMain.on('session:restart', (_e, { cwd }) => {
  spawnPty(cwd);
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  killPty();
  if (process.platform !== 'darwin') app.quit();
});
