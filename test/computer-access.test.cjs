const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function fixture(captureError) {
  const opened = [], module = { exports: {} };
  const electron = { app: { getName: () => 'MatiQ Solutions' },
    systemPreferences: { getMediaAccessStatus: () => captureError ? 'denied' : 'granted' },
    desktopCapturer: { getSources: async () => { if (captureError) throw captureError; return []; } },
    shell: { openExternal: async url => opened.push(url) } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/computer-access.cjs'), 'utf8'), {
    process: { platform: 'darwin' }, module,
    require: name => {
      if (name === 'electron') return electron;
      assert.equal(name, './native/mac-computer.node');
      return { access: () => ({ accessibility: true, postEvents: true }) };
    },
  });
  return { opened, request: module.exports.requestComputerAccess };
}
test('denied native capture still opens Screen Recording and reports the actual host identity', async () => {
  const f = fixture(Error('Failed to get sources.'));
  await assert.rejects(f.request('screen'), /Failed to get sources.*Enable MatiQ Solutions.*quit and reopen/);
  assert.deepEqual(f.opened, ['x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture']);
});
test('successful capture permission requests open settings and return actual access status', async () => {
  const f = fixture();
  const access = await f.request('screen');
  assert.equal(access.screen, 'granted'); assert.equal(access.input, 'granted');
  assert.deepEqual(f.opened, ['x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture']);
});
