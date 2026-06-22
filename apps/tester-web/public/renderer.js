/* global Terminal, FitAddon */

// ── Platform (server-side OS) ────────────────────────────────────────────────
let isWin32 = false;
const platformReady = fetch('/api/platform').then((r) => r.json()).then((d) => { isWin32 = d.win32; });

// ── WebSocket ────────────────────────────────────────────────────────────────
const ws = new WebSocket(`ws://${location.host}`);

function wsSend(obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

// ── Terminal setup ───────────────────────────────────────────────────────────
const term = new Terminal({
  fontFamily: '"Cascadia Code", Consolas, monospace',
  fontSize: 13,
  cursorBlink: true,
  theme: {
    background: '#11111b',
    foreground: '#cdd6f4',
    cursor: '#89b4fa',
  },
});
const fit = new FitAddon.FitAddon();
term.loadAddon(fit);
term.open(document.getElementById('terminal'));
fit.fit();

// PTY output → terminal
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'data') term.write(msg.data);
  if (msg.type === 'exit') setRunning(false);
};

// Terminal keystrokes → PTY
term.onData((data) => wsSend({ type: 'input', data }));

function syncSize() {
  fit.fit();
  wsSend({ type: 'resize', cols: term.cols, rows: term.rows });
}
window.addEventListener('resize', syncSize);
setTimeout(syncSize, 100);

// ── Form / command builder ───────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const LINK_LABELS = {
  figma: 'Figma link',
  sheet: 'Google Sheet link',
  markdown: 'Markdown spec (đường dẫn file/thư mục)',
  none: '',
};
const LINK_PLACEHOLDERS = {
  figma: 'https://www.figma.com/design/...',
  sheet: 'https://docs.google.com/spreadsheets/...',
  markdown: 'vd: docs/spec.md hoặc /home/user/specs',
  none: '',
};
const SOURCE_FLAG = {
  figma: '--figma-spec',
  sheet: '--sheet-spec',
  markdown: '--spec',
};

function updateLinkVisibility() {
  const source = $('source').value;
  const wrap = $('linkWrap');
  if (source === 'none') {
    wrap.style.display = 'none';
  } else {
    wrap.style.display = '';
    $('linkLabel').textContent = LINK_LABELS[source];
    $('link').placeholder = LINK_PLACEHOLDERS[source];
  }
  refreshPreview();
}

function arg(flag, value) {
  const v = (value || '').trim();
  if (!v) return '';
  return /\s/.test(v) ? `${flag} "${v}"` : `${flag} ${v}`;
}

function buildSlashCommand() {
  const skill = $('skill').value;
  const source = $('source').value;
  const parts = [`/${skill}`];

  parts.push(arg('--project', $('project').value));
  if (source !== 'none') parts.push(arg(SOURCE_FLAG[source], $('link').value));
  parts.push(arg('--module', $('module').value));
  parts.push(arg('--sheet-report', $('sheetReport').value));
  if ($('coverage').checked) parts.push('--coverage');
  if ($('run').checked) parts.push('--run');

  return parts.filter(Boolean).join(' ');
}

function buildShellCommand(slash) {
  if (isWin32) {
    // PowerShell: dùng double-quote, escape " bên trong thành \"
    return `claude "${slash.replace(/"/g, '\\"')}"`;
  }
  // Linux/Mac: single-quote, escape ' bên trong thành ''
  return `claude '${slash.replace(/'/g, "''")}'`;
}

function refreshPreview() {
  $('preview').textContent = buildShellCommand(buildSlashCommand());
}

['project', 'skill', 'source', 'link', 'module', 'sheetReport', 'run', 'coverage']
  .forEach((id) => $(id).addEventListener('input', refreshPreview));
$('source').addEventListener('change', updateLinkVisibility);

function setRunning(running) {
  const btn = document.querySelector('.btn-run');
  btn.disabled = running;
  btn.textContent = running ? '⏳ Running...' : '▶ Run';
}

$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  const cwd = $('project').value.trim();
  const command = buildShellCommand(buildSlashCommand());
  setRunning(true);
  term.focus();
  wsSend({ type: 'run', cwd, command });
});

$('restart').addEventListener('click', () => {
  wsSend({ type: 'restart', cwd: $('project').value.trim() });
  term.clear();
});

$('clear').addEventListener('click', () => term.clear());

// ── Dir picker modal ─────────────────────────────────────────────────────────
let currentModalPath = '';

// Detect Windows từ path pattern (C:\, D:\) — không phụ thuộc vào async flag
function isWindowsPath(p) {
  return /^[A-Za-z]:\\/.test(p);
}

// Detect đang ở drive root (C:\)
function isDriveRoot(p) {
  return /^[A-Za-z]:\\$/.test(p);
}

async function openModal(startPath) {
  await platformReady;
  const start = startPath || $('project').value.trim();
  if (start) {
    await loadDirs(start);
  } else if (isWin32) {
    await loadDrives();
  } else {
    await loadDirs('');
  }
  $('modalOverlay').classList.add('open');
}

// Click vào item bất kỳ = đi vào trong (navigate). Folder đang đứng hiện ở path bar = folder được chọn.
function addDirItem(list, icon, label, onNavigate) {
  const li = document.createElement('li');
  li.textContent = `${icon} ${label}`;
  if (onNavigate) li.addEventListener('click', onNavigate);
  list.appendChild(li);
}

async function loadDrives() {
  const res = await fetch('/api/drives');
  const data = await res.json();
  const list = $('dirList');
  list.innerHTML = '';
  $('modalPath').textContent = 'Chọn ổ đĩa — click vào ổ đĩa để vào trong';
  currentModalPath = '';
  $('modalSelect').disabled = true;
  $('modalSelect').textContent = 'Chọn thư mục này';
  if (data.drives.length === 0) {
    await loadDirs('');
    return;
  }
  data.drives.forEach((d) => addDirItem(list, '💾', d, () => loadDirs(d)));
}

async function loadDirs(reqPath) {
  const res = await fetch(`/api/dirs?path=${encodeURIComponent(reqPath)}`);
  const data = await res.json();
  if (data.error) return;

  currentModalPath = data.path;
  $('modalPath').textContent = data.path;
  $('modalSelect').disabled = false;
  $('modalSelect').textContent = `✅ Chọn: ${data.path.split(/[\\/]/).filter(Boolean).pop() || data.path}`;

  const list = $('dirList');
  list.innerHTML = '';

  const atDriveRoot = isDriveRoot(data.path);
  const onWindows = isWin32 || isWindowsPath(data.path);

  if (data.parent && data.parent !== data.path && !atDriveRoot) {
    addDirItem(list, '📂', '..', () => loadDirs(data.parent));
  }
  if (onWindows) {
    addDirItem(list, '💻', 'Đổi ổ đĩa (C:\\, D:\\...)', () => loadDrives());
  }

  data.dirs.forEach((d) => {
    const name = d.split(/[\\/]/).pop();
    addDirItem(list, '📁', name, () => loadDirs(d));
  });
}

$('browse').addEventListener('click', () => openModal());

$('modalSelect').addEventListener('click', () => {
  $('project').value = currentModalPath;
  refreshPreview();
  $('modalOverlay').classList.remove('open');
});

$('modalCancel').addEventListener('click', () => {
  $('modalOverlay').classList.remove('open');
});

$('modalOverlay').addEventListener('click', (e) => {
  if (e.target === $('modalOverlay')) $('modalOverlay').classList.remove('open');
});

updateLinkVisibility();
refreshPreview();
