const { _electron: electron } = require("playwright");
const fs = require("node:fs/promises");
const { createReadStream, realpathSync } = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const net = require("node:net");
const { createHash, randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const assert = require("node:assert/strict");
const lifecycle = require("./fixture-lifecycle.cjs");
const { ModelStore } = require("../src/models.cjs");
const { MODELS } = require("../src/catalog.cjs");
const { version: baseVersion } = require("../package.json");
const targetVersion = baseVersion
  .split(".")
  .map((n, i) => Number(n) + (i === 2 ? 1 : 0))
  .join(".");
async function hash(file) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest("hex");
}
async function waitFor(operation, description, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await operation();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw Error(description + " timed out. Inspect the native updater logs.");
}
function processesIn(directory) {
  return execFileSync("/bin/ps", ["-axww", "-o", "pid=,uid=,comm="], {
    encoding: "utf8",
  })
    .split("\n")
    .flatMap((line) => {
      const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);
      if (!match) return [];
      let executable = match[3];
      try {
        executable = realpathSync(executable);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      return executable.startsWith(directory + path.sep)
        ? [{ pid: Number(match[1]), uid: Number(match[2]), executable }]
        : [];
    });
}
function applicationInfo(pid) {
  const script = `ObjC.import('AppKit');var apps=$.NSRunningApplication.runningApplicationsWithBundleIdentifier('com.matiq.companion');var result={found:false};for(var i=0;i<apps.count;i++){var app=apps.objectAtIndex(i);if(app.processIdentifier===${pid})result={found:true,finished:app.isFinishedLaunching,terminated:app.isTerminated,bundle:ObjC.unwrap(app.bundleURL.path)};}JSON.stringify(result);`;
  return JSON.parse(
    execFileSync("/usr/bin/osascript", ["-l", "JavaScript", "-e", script], {
      encoding: "utf8",
      timeout: 15000,
    }),
  );
}
async function bundleVersion(apps) {
  const info = path.join(apps, "MatiQ Companion.app/Contents/Info.plist");
  try {
    await fs.access(info);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  return execFileSync(
    "/usr/bin/plutil",
    ["-extract", "CFBundleShortVersionString", "raw", "-o", "-", info],
    { encoding: "utf8", timeout: 15000 },
  ).trim();
}
(async () => {
  if (process.platform !== "darwin")
    throw Error("Run signed Mac upgrade qualification on macOS.");
  if (!process.env.COMPANION_VALIDATION_MODELS)
    throw Error("Supply the isolated verified model store.");
  if (
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.RUNNER_ENVIRONMENT !== "github-hosted"
  )
    throw Error(
      "Run default-profile upgrade qualification only on a fresh disposable GitHub-hosted VM.",
    );
  const root = path.resolve(__dirname, "..");
  const directory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "companion-upgrade-")),
  );
  const profile = path.join(
    os.homedir(),
    "Library",
    "Application Support",
    "MatiQ Companion",
  );
  const modelRoot = path.join(
    os.homedir(),
    "Library",
    "Application Support",
    "MatiQ",
    "Models",
  );
  const shipIt = path.join(
    os.homedir(),
    "Library",
    "Caches",
    "com.matiq.companion.ShipIt",
  );
  const apps = path.join(directory, "apps");
  let existingShipIt = false;
  try {
    await fs.lstat(shipIt);
    existingShipIt = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  assert.equal(
    processesIn(shipIt).length,
    0,
    "An existing updater process must not be adopted.",
  );
  for (const owned of [profile, modelRoot]) {
    try {
      await fs.lstat(owned);
      throw Error(
        "Refusing to touch an existing app/model/updater profile: " + owned,
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  await fs.mkdir(apps);
  await fs.mkdir(profile, { recursive: true });
  await fs.mkdir(modelRoot, { recursive: true });
  const marker = randomUUID(),
    baseZip = path.join(
      root,
      "dist",
      `MatiQ-Companion-${baseVersion}-mac-${process.arch}.zip`,
    );
  for (const owned of [profile, modelRoot])
    await fs.writeFile(path.join(owned, ".upgrade-owner"), marker, {
      flag: "wx",
      mode: 0o600,
    });
  execFileSync("/usr/bin/ditto", ["-x", "-k", baseZip, apps], {
    timeout: 120000,
  });
  const executable = path.join(
    apps,
    "MatiQ Companion.app/Contents/MacOS/MatiQ Companion",
  );
  const source = new ModelStore(process.env.COMPANION_VALIDATION_MODELS),
    destination = new ModelStore(modelRoot);
  assert.equal(
    await source.verify(MODELS[0]),
    true,
    "Verify source weights before qualification.",
  );
  const model = destination.location(MODELS[0]);
  await fs.mkdir(path.dirname(model), { recursive: true });
  await fs.copyFile(source.location(MODELS[0]), model);
  const targetDirectory = path.join(root, "upgrade-target"),
    metadataName = "latest-mac.yml";
  const allowed = new Set([
    metadataName,
    `MatiQ-Companion-${targetVersion}-mac-${process.arch}.zip`,
    `MatiQ-Companion-${targetVersion}-mac-${process.arch}.zip.blockmap`,
  ]);
  const server = http.createServer(async (req, res) => {
    try {
      const name = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      ).slice(1);
      if (!allowed.has(name)) {
        res.writeHead(404);
        res.end();
        return;
      }
      const file = path.join(targetDirectory, name),
        stat = await fs.stat(file);
      let start = 0,
        end = stat.size - 1,
        status = 200;
      if (req.headers.range) {
        const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
        if (!range) {
          res.writeHead(416);
          res.end();
          return;
        }
        start = Number(range[1]);
        end = range[2] ? Number(range[2]) : end;
        status = 206;
        if (start > end || end >= stat.size) {
          res.writeHead(416);
          res.end();
          return;
        }
      }
      res.writeHead(status, {
        "Content-Type": name.endsWith(".yml")
          ? "text/yaml"
          : "application/octet-stream",
        "Content-Length": end - start + 1,
        "Accept-Ranges": "bytes",
        ...(status === 206
          ? { "Content-Range": `bytes ${start}-${end}/${stat.size}` }
          : {}),
      });
      if (req.method === "HEAD") res.end();
      else
        createReadStream(file, { start, end })
          .on("error", (error) => res.destroy(error))
          .pipe(res);
    } catch (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500);
      res.end("Qualification fixture could not serve the requested artifact.");
    }
  });
  server.requestTimeout = 30000;
  let app,
    handle,
    owned,
    port,
    successful = false;
  const watchdog = setTimeout(() => {
    for (const process of [...processesIn(apps), ...processesIn(shipIt)])
      try {
        global.process.kill(process.pid, "SIGKILL");
      } catch (error) {
        if (error.code !== "ESRCH") console.error(error.message);
      }
    server.closeAllConnections();
    server.close();
  }, 240000);
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = server.address().port;
    app = await electron.launch({
      executablePath: executable,
      args: [],
      env: {
        ...process.env,
      },
    });
    handle = app.process();
    owned = lifecycle.capture(handle);
    const page = await app.firstWindow();
    const actualProfile = await app.evaluate(({ app }) =>
      app.getPath("userData"),
    );
    assert.equal(
      await fs.realpath(actualProfile),
      await fs.realpath(profile),
      "Qualification must use the real default user-data location.",
    );
    await page
      .getByRole("heading", { name: "Your own AI workspace." })
      .waitFor();
    const project = await page.evaluate(() =>
      window.companion.call("project.create", { name: "Upgrade preservation" }),
    );
    await page.evaluate(
      (id) =>
        window.companion.call("project.policy", {
          id,
          tool: "documents",
          enabled: true,
        }),
      project.id,
    );
    await page.evaluate(() =>
      window.companion.call("models.select", { id: "qwen3-0.6b" }),
    );
    const projectFile = path.join(
        profile,
        "projects",
        project.id,
        "project.json",
      ),
      generated = path.join(
        profile,
        "projects",
        project.id,
        "files",
        "retained.txt",
      ),
      settings = path.join(profile, "settings.json");
    await fs.writeFile(generated, marker);
    const before = {
      project: await hash(projectFile),
      settings: await hash(settings),
      model: await hash(model),
      file: await hash(generated),
    };
    await fs.mkdir(path.join(profile, "update-cache"));
    await app.evaluate(({ app }, url) => {
      app.setPath(
        "cache",
        require("node:path").join(app.getPath("userData"), "update-cache"),
      );
      const updater =
        process.mainModule.require("electron-updater").autoUpdater;
      updater.setFeedURL({ provider: "generic", url });
      updater.disableDifferentialDownload = true;
    }, `http://127.0.0.1:${port}/`);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("button", { name: "Check for updates", exact: true })
      .click();
    await page.waitForFunction(async (version) => {
      const state = await window.companion.call("state");
      if (state.updates.status === "error") throw Error(state.updates.message);
      return (
        state.updates.status === "available" &&
        state.updates.availableVersion === version
      );
    }, targetVersion);
    await page
      .getByRole("button", { name: "Download update", exact: true })
      .click();
    await page.waitForFunction(
      async () => {
        const state = await window.companion.call("state");
        if (state.updates.status === "error")
          throw Error(state.updates.message);
        return state.updates.status === "downloaded";
      },
      null,
      { timeout: 120000 },
    );
    owned = lifecycle.capture(handle);
    await page
      .getByRole("button", { name: "Restart to update", exact: true })
      .click();
    const launch = await waitFor(async () => {
      if ((await bundleVersion(apps)) !== targetVersion) return false;
      const processInfo = processesIn(apps).find(
        (info) =>
          info.executable === realpathSync(executable) &&
          info.pid !== handle.pid,
      );
      if (!processInfo) return false;
      assert.equal(
        processInfo.uid,
        process.getuid(),
        "The new app must run as the same user.",
      );
      const info = applicationInfo(processInfo.pid);
      return info.found && info.finished && !info.terminated
        ? { ...processInfo, version: targetVersion }
        : false;
    }, "Signed replacement and automatic restart");
    assert.equal(
      await fs.realpath(applicationInfo(launch.pid).bundle),
      await fs.realpath(path.join(apps, "MatiQ Companion.app")),
    );
    const after = {
      project: await hash(projectFile),
      settings: await hash(settings),
      model: await hash(model),
      file: await hash(generated),
    };
    assert.deepEqual(after, before, "Upgrade changed retained user data.");
    assert.equal(await fs.readFile(generated, "utf8"), marker);
    const proof = {
      platform: "darwin",
      baseVersion,
      targetVersion,
      signedDownloadRestart: true,
      automaticRelaunch: true,
      observation:
        "macOS finished-launching bundle, replaced version and new same-user PID",
      dataPaths:
        "unchanged default profile and shared model store on disposable CI VM",
      baseZipSha256: await hash(baseZip),
      retained: {
        project: true,
        settings: true,
        modelSha256: true,
        generatedFile: true,
      },
      feed: "test-owned loopback fixture",
      at: new Date().toISOString(),
    };
    await fs.writeFile(
      path.join(root, "dist", "upgrade-proof.json"),
      JSON.stringify(proof, null, 2) + "\n",
    );
    successful = true;
    console.log(
      "PASS: real signed download/restart into " +
        targetVersion +
        "; project, settings, model SHA256 and generated file preserved.",
    );
  } finally {
    clearTimeout(watchdog);
    if (handle && handle.exitCode === null && handle.signalCode === null)
      await app.close();
    const diagnostic = {
      successful,
      installedVersion: await bundleVersion(apps),
      processes: [...processesIn(apps), ...processesIn(shipIt)],
      logs: {},
    };
    for (const name of ["ShipIt_stderr.log", "ShipIt_stdout.log"]) {
      try {
        diagnostic.logs[name] = (
          await fs.readFile(path.join(shipIt, name), "utf8")
        ).slice(-16000);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    await fs.mkdir(path.join(root, ".validation"), { recursive: true });
    await fs.writeFile(
      path.join(root, ".validation", "upgrade-diagnostic.json"),
      JSON.stringify(diagnostic, null, 2) + "\n",
    );
    console.log("Upgrade diagnostics:", JSON.stringify(diagnostic));
    for (const process of [...processesIn(apps), ...processesIn(shipIt)]) {
      const snapshot = lifecycle.capture({ pid: process.pid });
      global.process.kill(process.pid, "SIGTERM");
      await lifecycle.verifyStopped(snapshot);
    }
    await lifecycle.verifyStopped(owned);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    if (port)
      await new Promise((resolve, reject) => {
        const socket = net.connect({ host: "127.0.0.1", port });
        socket.once("connect", () => {
          socket.destroy();
          reject(Error("Qualification fixture port remains open."));
        });
        socket.once("error", (error) =>
          error.code === "ECONNREFUSED" ? resolve() : reject(error),
        );
      });
    assert.equal(
      [...processesIn(apps), ...processesIn(shipIt)].length,
      0,
      "Owned updater processes remain.",
    );
    for (const owned of [profile, modelRoot]) {
      assert.equal(
        await fs.readFile(path.join(owned, ".upgrade-owner"), "utf8"),
        marker,
        "Owned cleanup marker changed; inspect before removal.",
      );
      await fs.rm(owned, { recursive: true });
    }
    if (!existingShipIt) await fs.rm(shipIt, { recursive: true, force: true });
    await fs.rm(directory, { recursive: true, force: true });
    console.log("PASS: upgrade fixture process and loopback port cleanup.");
  }
  assert.ok(successful, "The signed upgrade did not complete.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
