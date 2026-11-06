const lifecycle = require("./fixture-lifecycle.cjs");
const { _electron: electron } = require("playwright");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
(async () => {
  const profile = await fs.mkdtemp(
    path.join(os.tmpdir(), "companion-computer-"),
  );
  let app, processHandle, owned;
  const timer = setTimeout(() => {
    app?.process().kill("SIGKILL");
    process.exitCode = 1;
  }, 90000);
  try {
    app = await electron.launch({
      args: [path.resolve(__dirname, "..")],
      env: { ...process.env, COMPANION_TEST_PROFILE: profile },
    });
    processHandle = app.process();
    owned = lifecycle.capture(processHandle);
    app.on("console", (m) => console.log("Electron:", m.text()));
    await app.firstWindow();
    const result = await app.evaluate(
      async ({ BrowserWindow }, root) => {
        const { createComputer } = process.mainModule.require(
          root + "/src/computer.cjs",
        );
        const main = BrowserWindow.getAllWindows()[0];
        const fixture = new BrowserWindow({
          width: 800,
          height: 600,
          webPreferences: {
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
          },
        });
        try {
          await fixture.loadURL(
            "data:text/html," +
              encodeURIComponent(
                '<html><body style="background:white;font:40px sans-serif"><p>Companion computer verification</p><input id="target" style="font:32px sans-serif" autofocus></body></html>',
              ),
          );
          fixture.show();
          fixture.focus();
          const computer = createComputer(main);
          console.log("Capturing fixture screen");
          const observed = await computer(
            "observe_screen",
            {},
            new AbortController().signal,
          );
          console.log("Screen captured");
          await computer(
            "type_text",
            { text: "Local input verified" },
            new AbortController().signal,
          );
          return {
            text: observed.text,
            value: await fixture.webContents.executeJavaScript(
              'document.getElementById("target").value',
            ),
          };
        } finally {
          fixture.destroy();
        }
      },
      path.resolve(__dirname, ".."),
    );
    assert.match(result.text, /computer verification/i);
    assert.equal(result.value, "Local input verified");
    console.log(
      "PASS: actual local screen OCR and native typing into an isolated fixture.",
    );
  } finally {
    await app?.close();
    await lifecycle.verifyStopped(owned);
    clearTimeout(timer);
    if (app)
      assert.ok(
        processHandle.exitCode !== null || processHandle.signalCode !== null,
        "Electron test process must exit",
      );
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
