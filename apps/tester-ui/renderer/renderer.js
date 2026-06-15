/* global Terminal, FitAddon */

// ── Terminal setup ──────────────────────────────────────────────────────────
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
window.api.onData((data) => term.write(data));
// Terminal keystrokes → PTY (this is what makes checkpoints interactive)
term.onData((data) => window.api.sendInput(data));

function syncSize() {
  fit.fit();
  window.api.resize(term.cols, term.rows);
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
  markdown: 'vd: docs/spec.md hoặc D:\\specs',
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

// Quote a value only if it contains whitespace (paths/URLs usually don't).
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

// Wrap the whole prompt in PowerShell single quotes (literal), so inner
// double quotes for spaced values pass through to claude untouched.
function buildShellCommand(slash) {
  return `claude '${slash.replace(/'/g, "''")}'`;
}

function refreshPreview() {
  $('preview').textContent = buildShellCommand(buildSlashCommand());
}

// Live preview on any change
['project', 'skill', 'source', 'link', 'module', 'sheetReport', 'run', 'coverage']
  .forEach((id) => $(id).addEventListener('input', refreshPreview));
$('source').addEventListener('change', updateLinkVisibility);

$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  const cwd = $('project').value.trim();
  const command = buildShellCommand(buildSlashCommand());
  term.focus();
  window.api.run(cwd, command);
});

$('restart').addEventListener('click', () => {
  window.api.restart($('project').value.trim());
  term.clear();
});

$('clear').addEventListener('click', () => term.clear());

$('browse').addEventListener('click', async () => {
  const picked = await window.api.pickFolder($('project').value);
  if (picked) {
    $('project').value = picked;
    refreshPreview();
  }
});

updateLinkVisibility();
refreshPreview();
