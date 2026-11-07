const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  crypto = require("node:crypto");
test("prototype renders against sample state and cannot dispatch an unrecognized desktop operation", async () => {
  const sandbox = {
    window: {},
    location: { search: "?mode=hosted" },
    URLSearchParams,
    structuredClone,
    crypto,
    setTimeout,
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../prototype/bridge.js"), "utf8"),
    sandbox,
  );
  const api = sandbox.window.companion;
  const state = await api.call("state");
  assert.equal(state.hosted, true);
  const chat = await api.call("chat.create");
  await api.call("chat.send", { id: chat.id, text: "Example design question" });
  const saved = await api.call("project.open", { id: chat.id });
  assert.equal(saved.messages[0].text, "Example design question");
  assert.match(saved.messages[1].text, /scripted/);
  await assert.rejects(api.call("native.arbitrary"), /Prototype only/);
});
