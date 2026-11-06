const lifecycle = require("./fixture-lifecycle.cjs");
const { waitFor } = require("./wait-for.cjs");
const { _electron: electron } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
(async () => {
  const profile = await fs.mkdtemp(
    path.join(os.tmpdir(), "companion-desktop-"),
  );
  if (process.env.COMPANION_VALIDATION_MODELS) {
    const { ModelStore } = require("../src/models.cjs");
    const { MODELS } = require("../src/catalog.cjs");
    const source = new ModelStore(process.env.COMPANION_VALIDATION_MODELS),
      target = new ModelStore(path.join(profile, "test-models"));
    const dest = target.location(MODELS[0]);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    try {
      await fs.link(source.location(MODELS[0]), dest);
    } catch (e) {
      if (e.code !== "EXDEV") throw e;
      await fs.copyFile(
        source.location(MODELS[0]),
        dest,
        require("node:fs").constants.COPYFILE_EXCL,
      );
    }
  }
  let app, owned;
  const watchdog = setTimeout(() => {
    app?.process().kill("SIGKILL");
    process.exitCode = 1;
  }, 90000);
  try {
    app = await electron.launch({
      executablePath: process.env.COMPANION_EXECUTABLE_PATH || undefined,
      args: process.env.COMPANION_EXECUTABLE_PATH
        ? []
        : [path.resolve(__dirname, "..")],
      env: { ...process.env, COMPANION_TEST_PROFILE: profile },
    });
    const page = await app.firstWindow();
    owned = lifecycle.capture(app.process());
    await page
      .getByRole("heading", { name: "Your own AI workspace." })
      .waitFor();
    await page
      .getByRole("button", { name: "Create a project", exact: true })
      .click();
    await page.getByLabel("New project").fill("Local project");
    await page
      .getByRole("button", { name: "Create project", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Think, write and make things." })
      .waitFor();
    await page.getByRole("button", { name: "Manage tools" }).click();
    assert.equal(await page.getByRole("checkbox").count(), 4);
    await page.getByRole("checkbox", { name: "Word and Excel" }).check();
    const state = await page.evaluate(() => window.companion.call("state"));
    await waitFor(() => page.evaluate(
      async (id) => (await window.companion.call("project.open", { id })).tools.documents,
      state.projects[0].id,
    ), "Project permission persistence", 10000);
    const p = await page.evaluate(
      (id) => window.companion.call("project.open", { id }),
      state.projects[0].id,
    );
    assert.equal(p.tools.documents, true);
    assert.equal(p.tools.search, false);
    assert.equal(p.tools.computer, false);
    await page.getByRole("button", { name: "Models", exact: true }).click();
    await page
      .getByRole("heading", { name: "Models on your computer." })
      .waitFor();
    await fs.mkdir(".validation", { recursive: true });
    await page.screenshot({ path: ".validation/companion-models.png" });
    if (process.env.COMPANION_VALIDATION_MODELS) {
      await page.evaluate(() =>
        window.companion.call("models.select", { id: "qwen3-0.6b" }),
      );
    }
    await page.getByRole("button", { name: "Chat", exact: true }).click();
    await page
      .getByRole("heading", { name: "Think, write and make things." })
      .waitFor();
    if (process.env.COMPANION_VALIDATION_MODELS) {
      await page
        .getByLabel("Message Companion")
        .fill("Reply with the word Hello.");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await page
        .locator(".message.assistant:not(#live-message)")
        .filter({ hasText: "Hello" })
        .waitFor({ timeout: 60000 });
      console.log(
        "PASS: actual local inference through Electron, isolated worker, IPC and chat rendering.",
      );
    }
    await page.screenshot({ path: ".validation/companion-chat.png" });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Download update", exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "Restart to update", exact: true }).isDisabled(), true);
    console.log(
      "PASS: real Electron navigation, project persistence, independent tool toggles and model setup screen.",
    );
  } finally {
    await app?.close();
    await lifecycle.verifyStopped(owned);
    clearTimeout(watchdog);
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
