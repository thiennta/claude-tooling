const { contextBridge, ipcRenderer } = require('electron');

// Minimal, safe bridge between the renderer (form + xterm) and the PTY in main.
contextBridge.exposeInMainWorld('api', {
  // PTY output stream → terminal
  onData: (cb) => ipcRenderer.on('pty:data', (_e, data) => cb(data)),

  // Terminal keystrokes → PTY stdin
  sendInput: (data) => ipcRenderer.send('pty:input', data),

  // Keep PTY size in sync with the xterm viewport
  resize: (cols, rows) => ipcRenderer.send('pty:resize', { cols, rows }),

  // Form "Run": spawn a fresh session in cwd and submit the built command
  run: (cwd, command) => ipcRenderer.send('session:run', { cwd, command }),

  // Restart the shell session (without running anything)
  restart: (cwd) => ipcRenderer.send('session:restart', { cwd }),

  // Open native folder picker; resolves to selected path or null
  pickFolder: (current) => ipcRenderer.invoke('dialog:pickFolder', current),
});
