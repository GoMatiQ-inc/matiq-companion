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
      executablePath: process.env.COMPANION_EXECUTABLE_PATH || undefined,
      args: process.env.COMPANION_EXECUTABLE_PATH ? [] : [path.resolve(__dirname, "..")],
      env: { ...process.env, COMPANION_TEST_PROFILE: profile },
    });
    processHandle = app.process();
    owned = lifecycle.capture(processHandle);
    app.on("console", (m) => console.log("Electron:", m.text()));
    const mainPage = await app.firstWindow();
    await mainPage.getByRole("heading", {name:"Your own AI workspace."}).waitFor();
    const result = await app.evaluate(
      async ({ BrowserWindow, app, screen }) => {
        const root = app.getAppPath();
        const { createComputer } = process.mainModule.require(root + "/src/computer.cjs");
        const { computerAccess } = process.mainModule.require(root + "/src/computer-access.cjs");
        const main = BrowserWindow.getAllWindows()[0];
        const fixture = new BrowserWindow({
          alwaysOnTop: true,
          width: 800,
          height: 600,
          x: screen.getPrimaryDisplay().workArea.x + 40,
          y: screen.getPrimaryDisplay().workArea.y + 60,
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
                '<html><body style="background:white;color:black;font:40px sans-serif"><p>Companion computer verification</p><label for="target">TARGET</label><input id="target" style="display:block;font:28px sans-serif;width:650px"><button id="confirm" style="background:#eee;color:black;border:0;padding:24px;margin-top:30px;font:48px sans-serif">VERIFY</button><script>window.clicks=0;window.trustedMouse=false;window.trustedKey=false;document.addEventListener("mousedown",e=>window.trustedMouse=e.isTrusted);document.addEventListener("keydown",e=>window.trustedKey=e.isTrusted);document.getElementById("confirm").onclick=()=>window.clicks++;</script></body></html>',
              ),
          );
          fixture.show();
          fixture.focus();
          await fixture.webContents.executeJavaScript('document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))');
          await new Promise(resolve => setTimeout(resolve, 300));
          const computer = createComputer(main);
          const signal = new AbortController().signal;
          const observe = () => computer("observe_screen", {}, signal);
          const observed = await observe();
          const target = observed.words.find((word) => /^target$/i.test(word.text));
          if (!target) {
            const b = fixture.getBounds(), d = screen.getPrimaryDisplay().bounds;
            const words = observed.words.filter(w => w.x >= b.x-d.x && w.x < b.x-d.x+b.width && w.y >= b.y-d.y && w.y < b.y-d.y+b.height).map(w => w.text);
            throw Error("OCR did not locate the fixture Target label: " + JSON.stringify({words,bounds:b,display:d,scale:screen.getPrimaryDisplay().scaleFactor}));
          }
          await computer("click_screen", { x: target.x, y: target.y }, signal);
          if (await fixture.webContents.executeJavaScript('document.activeElement.id') !== "target") throw Error("Native pointer click did not focus the fixture input.");
          let staleRejected = false;
          try { await computer("type_text", { text: "must not type" }, signal); }
          catch (error) { if (!/Observe the screen again/.test(error.message)) throw error; staleRejected = true; }
          if (!staleRejected) throw Error("Input reused an invalidated observation.");
          await observe();
          await computer("type_text", { text: process.platform === "linux" ? "Local input verified!" : "Local input verified café!" }, signal);
          await observe();
          await computer("press_key", { key: "Backspace" }, signal);
          const last = await observe();
          const confirm = last.words.find((word) => /^verify$/i.test(word.text));
          if (!confirm) {
            const b = fixture.getBounds(), d = screen.getPrimaryDisplay().bounds;
            const fixtureWords = last.words.filter(w => w.x >= b.x-d.x && w.x < b.x-d.x+b.width && w.y >= b.y-d.y && w.y < b.y-d.y+b.height).map(w => w.text);
            throw Error("OCR did not locate the Confirm button in the owned fixture: " + JSON.stringify(fixtureWords));
          }
          await computer("click_screen", { x: confirm.x, y: confirm.y }, signal);
          return {
            text: observed.text,
            value: await fixture.webContents.executeJavaScript('document.getElementById("target").value'),
            clicks: await fixture.webContents.executeJavaScript('window.clicks'),
            trustedMouse: await fixture.webContents.executeJavaScript('window.trustedMouse'),
            trustedKey: await fixture.webContents.executeJavaScript('window.trustedKey'),
            staleRejected,
            access: computerAccess(),
            scaleFactor: screen.getPrimaryDisplay().scaleFactor,
            packaged: app.isPackaged,
          };
        } finally {
          fixture.destroy();
        }
      },
      path.resolve(__dirname, ".."),
    );
    assert.match(result.text, /computer verification/i);
    assert.equal(result.value, process.platform === "linux" ? "Local input verified" : "Local input verified café");
    assert.equal(result.clicks, 1);
    assert.equal(result.trustedMouse, true);
    assert.equal(result.trustedKey, true);
    assert.equal(result.staleRejected, true);
    await fs.mkdir(".validation", { recursive: true });
    await fs.writeFile(path.join(".validation", `computer-${process.platform}-${process.arch}-${result.packaged ? "packaged" : "development"}.json`), JSON.stringify({ platform: process.platform, arch: process.arch, ...result }, null, 2) + "\n");
    console.log(
      `PASS: real screen OCR, pointer focus/click, ${process.platform === "linux" ? "ASCII" : "Unicode"} typing, key input and observation invalidation in an owned fixture.`,
    );
  } catch (error) {
    let access;
    try { access = await app.evaluate(({ app }) => process.mainModule.require(app.getAppPath() + "/src/computer-access.cjs").computerAccess()); }
    catch (diagnosticError) { access = { unavailable: diagnosticError.message }; }
    await fs.mkdir(".validation", { recursive: true });
    await fs.writeFile(path.join(".validation", `computer-${process.platform}-${process.arch}-failure.json`), JSON.stringify({ platform: process.platform, arch: process.arch, error: error.message, access }, null, 2) + "\n");
    throw error;
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
