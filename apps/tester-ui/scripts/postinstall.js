// After `npm install`, prebuild-install only fetched the Node-ABI binary of
// node-pty. Electron uses a different ABI, so fetch the matching Electron
// prebuilt binary too (no C++ build tools required). Runs automatically via the
// "postinstall" script.
//
// We invoke prebuild-install's bin via `node <bin.js>` rather than `npx` —
// Node 24 on Windows throws EINVAL when spawning a `.cmd` without shell:true.
const { execFileSync } = require('child_process');
const path = require('path');

try {
  const pkgDir = path.dirname(
    require.resolve('@homebridge/node-pty-prebuilt-multiarch/package.json')
  );
  const electronVersion = require('electron/package.json').version;
  const prebuildBin = require.resolve('prebuild-install/bin.js');

  console.log(`[postinstall] fetching node-pty prebuilt for Electron ${electronVersion}...`);
  execFileSync(
    process.execPath,
    [prebuildBin, '-r', 'electron', '-t', electronVersion, '--tag-prefix', 'v'],
    { cwd: pkgDir, stdio: 'inherit' }
  );
  console.log('[postinstall] Electron prebuilt binary ready.');
} catch (err) {
  console.warn(
    '[postinstall] Could not fetch Electron prebuilt for node-pty automatically.\n' +
    '             The app may fail to open a terminal. See README "Cài đặt".\n' +
    '             ' + err.message
  );
}
