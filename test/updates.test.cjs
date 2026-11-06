const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { configureUpdates } = require("../src/updates.cjs");
test("updates require explicit download and restart after a completed download", async () => {
  const u = new EventEmitter();
  let downloads = 0,
    restarts = 0;
  u.checkForUpdates = async () => {
    u.emit("update-available", { version: "0.2.0" });
  };
  u.downloadUpdate = async () => {
    downloads++;
    u.emit("download-progress", { percent: 42.3 });
    u.emit("update-downloaded");
  };
  u.quitAndInstall = (silent, run) => {
    assert.equal(silent, true);
    assert.equal(run, true);
    restarts++;
  };
  const events = [];
  const c = configureUpdates(
    { isPackaged: true, getVersion: () => "0.1.0" },
    (e) => events.push(structuredClone(e)),
    u,
  );
  assert.equal(u.autoDownload, false);
  assert.equal(u.autoInstallOnAppQuit, false);
  assert.throws(() => c.install(), /Download/);
  await assert.rejects(c.download(), /Check/);
  await c.check();
  assert.equal(downloads, 0);
  assert.equal(c.state.availableVersion, "0.2.0");
  await c.download();
  assert.equal(downloads, 1);
  assert.equal(restarts, 0);
  assert.equal(c.state.status, "downloaded");
  c.install();
  assert.equal(restarts, 1);
  assert.equal(c.state.status, "installing");
  assert.match(c.state.message, /restart/);
  assert.throws(() => c.install(), /Download/);
  await assert.rejects(c.check(), /installing/);
  assert.equal(restarts, 1);
  u.emit("error", Error("Network unavailable"));
  assert.equal(c.state.status, "error");
  assert.match(c.state.message, /Network/);
  assert.ok(events.some((e) => e.state.percent === 42));
});
test("development builds cannot pretend to install updates", async () => {
  const c = configureUpdates(
    { isPackaged: false, getVersion: () => "0.1.0" },
    () => {},
  );
  await assert.rejects(c.check(), /installed release/);
  assert.throws(() => c.install(), /Download/);
});

test("pending downloads block duplicate downloads and restart until completion", async () => {
  const updater = new EventEmitter();
  let finish;
  updater.checkForUpdates = async () => updater.emit("update-available", { version: "0.2.0" });
  updater.downloadUpdate = () => new Promise((resolve) => { finish = () => { updater.emit("update-downloaded"); resolve(); }; });
  let restarts = 0;
  updater.quitAndInstall = () => restarts++;
  const updates = configureUpdates({ isPackaged: true, getVersion: () => "0.1.0" }, () => {}, updater);
  await updates.check();
  const download = updates.download();
  assert.equal(updates.state.status, "downloading");
  assert.throws(() => updates.install(), /Download the update first/);
  await assert.rejects(updates.download(), /Check for an available update first/);
  assert.equal(restarts, 0);
  finish();
  await download;
  updates.install();
  assert.equal(restarts, 1);
});


test("a synchronous installer failure remains visible and does not claim success", () => {
  const updater = new EventEmitter();
  updater.quitAndInstall = () => { throw Error("Installer could not start. Restart the app and try again."); };
  const events = [];
  const updates = configureUpdates({ isPackaged: true, getVersion: () => "0.1.0" }, (event) => events.push(structuredClone(event)), updater);
  updater.emit("update-downloaded");
  assert.throws(() => updates.install(), /Installer could not start/);
  assert.equal(updates.state.status, "error");
  assert.match(updates.state.message, /Restart the app/);
  assert.deepEqual(events.map((event) => event.state.status), ["downloaded", "installing", "error"]);
});
