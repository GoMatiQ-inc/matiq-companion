const test = require("node:test");
const assert = require("node:assert/strict");
const { waitFor } = require("../scripts/wait-for.cjs");
test("native fixture waits poll resolved async values instead of treating promises as ready", async () => {
  let attempts = 0;
  const ready = await waitFor(async () => ++attempts >= 3, "Async readiness", 2000);
  assert.equal(ready, true);
  assert.equal(attempts, 3);
});
test("native fixture wait preserves actual operation errors", async () => {
  const error = Error("Download rejected by the native updater");
  await assert.rejects(waitFor(async () => { throw error; }, "Download", 1000), (actual) => actual === error);
});
