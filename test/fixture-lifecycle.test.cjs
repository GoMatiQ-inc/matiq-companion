const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function fixture(counts, ports = '') {
  let queries = 0;
  const context = {
    module: {exports: {}},
    process: {platform: 'win32', kill() {throw Object.assign(Error('Denied probe'), {code: 'EPERM'});}},
    console: {log() {}},
    setTimeout: resolve => resolve(),
    require(name) {
      if (name !== 'node:child_process') return require(name);
      return {execFileSync(command) {
        if (command === 'netstat') return ports;
        queries++;
        const result = counts.shift();
        if (result instanceof Error) throw result;
        return result;
      }};
    },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../scripts/fixture-lifecycle.cjs'), 'utf8'), context);
  return {verify: () => context.module.exports.verifyStopped({pid: 1234, ports: [4321]}), queries: () => queries};
}
test('denied Windows probes require independent process absence and free captured ports', async () => {
  const f = fixture(['1', '0']);
  await f.verify();
  assert.equal(f.queries(), 2);
  await assert.rejects(fixture(Array(60).fill('1')).verify(), /still alive/);
  await assert.rejects(fixture(['invalid']).verify(), /invalid Windows process-table/);
  await assert.rejects(fixture([Error('CIM unavailable')]).verify(), /CIM unavailable/);
  await assert.rejects(fixture(['0'], 'TCP 127.0.0.1:4321 0.0.0.0:0 LISTENING 5678').verify(), /listener remains occupied/);
});
