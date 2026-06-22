/* global Terminal, FitAddon */

// ── Platform (server-side OS) ────────────────────────────────────────────────
let isWin32 = false;
fetch('/api/platform').then((r) => r.json()).then((d) => { isWin32 = d.win32; });

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

async function openModal(startPath) {
  await loadDirs(startPath || $('project').value.trim() || '');
  $('modalOverlay').classList.add('open');
}

function addDirItem(list, icon, label, onClick) {
  const li = document.createElement('li');
  li.textContent = `${icon} ${label}`;
  li.addEventListener('click', onClick);
  list.appendChild(li);
}

async function loadDrives() {
  const res = await fetch('/api/drives');
  const data = await res.json();
  const list = $('dirList');
  list.innerHTML = '';
  $('modalPath').textContent = 'My Computer';
  currentModalPath = '';
  data.drives.forEach((d) => addDirItem(list, '💾', d, () => loadDirs(d)));
}

async function loadDirs(reqPath) {
  const res = await fetch(`/api/dirs?path=${encodeURIComponent(reqPath)}`);
  const data = await res.json();
  if (data.error) return;

  currentModalPath = data.path;
  $('modalPath').textContent = data.path;

  const list = $('dirList');
  list.innerHTML = '';

  // Trên Windows: khi đang ở root ổ đĩa (C:\) thì nút ".." → danh sách ổ đĩa
  if (data.parent && data.parent !== data.path) {
    addDirItem(list, '📂', '..', () => loadDirs(data.parent));
  } else if (isWin32) {
    addDirItem(list, '💻', 'My Computer (đổi ổ đĩa)', () => loadDrives());
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
