const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(
  path.join(__dirname, "../scripts/release-config.cjs"),
  "utf8",
);
function load(platform, env) {
  const module = { exports: {} };
  vm.runInNewContext(source, {
    require: () => require("../package.json"),
    module,
    process: { platform, env },
  });
  return module.exports;
}
test("release configuration rejects missing native signing and notarization", () => {
  assert.throws(() => load("linux", {}), /native/);
  assert.throws(() => load("darwin", {}), /Developer ID/);
  assert.throws(
    () =>
      load("darwin", {
        CSC_LINK: "test-certificate-reference",
        CSC_KEY_PASSWORD: "test-password",
        CSC_NAME: "Developer ID Application: Test",
      }),
    /notarization/,
  );
  assert.throws(() => load("win32", {}), /Windows code-signing/);
});
