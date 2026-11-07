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
const { cleanupDesktop } = require("@matiq-solutions/sdk/fixture-cleanup.cjs");
const { waitFor } = require("./wait-for.cjs");
const { ModelStore, sharedRoot } = require("../src/models.cjs");
const windows = process.platform === "win32";
const systemInstall = !windows && process.env.COMPANION_UPGRADE_SYSTEM_INSTALL === "1";
function powershell(script, env = {}) { return execFileSync("powershell.exe",["-NoProfile","-NonInteractive","-Command",script],{encoding:"utf8",timeout:15000,env:{...process.env,...env}}).trim(); }
const { MODELS } = require("../src/catalog.cjs");
const baseVersion = process.env.COMPANION_UPGRADE_BASE_VERSION || require("../package.json").version;
const targetVersion = process.env.COMPANION_UPGRADE_TARGET_VERSION || baseVersion
  .split(".")
  .map((n, i) => Number(n) + (i === 2 ? 1 : 0))
  .join(".");
for (const version of [baseVersion,targetVersion]) assert.match(version,/^\d+\.\d+\.\d+$/);
assert.equal(require("../node_modules/semver").gt(targetVersion,baseVersion),true,"Upgrade target must be newer than the base.");
async function hash(file) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest("hex");
}
function processesIn(directory) {
  if (windows) {
    const rows=JSON.parse(powershell("$ErrorActionPreference='Stop';$prefix=[IO.Path]::GetFullPath($env:COMPANION_OWNED_DIR).TrimEnd([char]92)+[char]92;@{rows=@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -and $_.ExecutablePath.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)} | ForEach-Object {$owner=Invoke-CimMethod -InputObject $_ -MethodName GetOwnerSid;if($owner.ReturnValue -ne 0){throw 'Cannot verify the owned process user.'};@{pid=[int]$_.ProcessId;uid=$owner.Sid;executable=$_.ExecutablePath}})} | ConvertTo-Json -Depth 4",{COMPANION_OWNED_DIR:directory})).rows;
    return rows;
  }
  return execFileSync("/bin/ps", ["-axww", "-o", "pid=,uid=,comm="], {
    encoding: "utf8",
  })
    .split("\n")
    .flatMap((line) => {
      const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);
      if (!match) return [];
      let executable = match[3];
      if (!executable.startsWith(directory + path.sep)) return [];
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
  if(windows) return JSON.parse(powershell(`$ErrorActionPreference='Stop';$p=Get-Process -Id ${Number(pid)};@{found=$true;finished=($p.MainWindowHandle -ne 0);terminated=$p.HasExited;bundle=(Split-Path $p.Path)}|ConvertTo-Json`));
  const script = `ObjC.import('AppKit');var apps=$.NSRunningApplication.runningApplicationsWithBundleIdentifier('com.matiq.companion');var result={found:false};for(var i=0;i<apps.count;i++){var app=apps.objectAtIndex(i);if(app.processIdentifier===${pid})result={found:true,finished:app.isFinishedLaunching,terminated:app.isTerminated,bundle:ObjC.unwrap(app.bundleURL.path)};}JSON.stringify(result);`;
  return JSON.parse(
    execFileSync("/usr/bin/osascript", ["-l", "JavaScript", "-e", script], {
      encoding: "utf8",
      timeout: 15000,
    }),
  );
}
async function bundleVersion(apps) {
  if(windows) {
    const executable=path.join(apps,'MatiQ Companion.exe');
    try {await fs.access(executable);}catch(error){if(error.code==='ENOENT')return null;throw error;}
    return powershell("$ErrorActionPreference='Stop';(Get-Item -LiteralPath $env:COMPANION_OWNED_EXE).VersionInfo.ProductVersion",{COMPANION_OWNED_EXE:executable});
  }
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
  if (!["darwin","win32"].includes(process.platform))
    throw Error("Run signed upgrade qualification on native macOS or Windows.");
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
  const profile = windows ? path.join(process.env.APPDATA,'MatiQ Companion') : path.join(os.homedir(),'Library','Application Support','MatiQ Companion');
  const modelRoot = sharedRoot();
  const updaterCache = path.join(windows ? process.env.LOCALAPPDATA : path.join(os.homedir(),"Library","Caches"),"matiq-companion-updater");
  const shipIt = windows ? path.join(process.env.LOCALAPPDATA,'matiq-companion-updater') : path.join(os.homedir(),'Library','Caches','com.matiq.companion.ShipIt');
  const apps = systemInstall ? "/Applications" : path.join(directory, "apps");
  const ownedApplication = windows ? apps : path.join(apps,"MatiQ Companion.app");
  if(systemInstall) {
    try {await fs.lstat(ownedApplication);throw Error("Refusing to adopt an existing system-installed Companion app.");}catch(error){if(error.code!=="ENOENT")throw error;}
    const {spawnSync}=require("node:child_process");
    const receipt=spawnSync("/usr/sbin/pkgutil",["--pkg-info","com.matiq.companion"],{encoding:"utf8",timeout:15000});
    assert.equal(receipt.status,1,"Refusing to adopt an existing Companion installer receipt.");
  }
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
  for (const owned of [profile, modelRoot, updaterCache]) {
    try {
      await fs.lstat(owned);
      throw Error(
        "Refusing to touch an existing app/model/updater profile: " + owned,
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  if(!systemInstall) await fs.mkdir(apps);
  await fs.mkdir(profile, { recursive: true });
  await fs.mkdir(modelRoot, { recursive: true });
  await fs.mkdir(updaterCache, { recursive: true });
  const marker = randomUUID(),
    baseZip = path.join(
      root,
      "dist",
      `MatiQ-Companion-${baseVersion}-${windows ? "windows" : "mac"}-${process.arch}.${windows ? "exe" : "zip"}`,
    );
  for (const owned of [profile, modelRoot, updaterCache])
    await fs.writeFile(path.join(owned, ".upgrade-owner"), marker, {
      flag: "wx",
      mode: 0o600,
    });
  if(windows) execFileSync(baseZip,['/S','/D='+apps],{timeout:120000});
  else if(systemInstall) {
    const pkg=path.join(root,"dist",`MatiQ-Companion-${baseVersion}-mac-${process.arch}.pkg`);
    execFileSync("/usr/bin/sudo",["-n","/usr/sbin/installer","-pkg",pkg,"-target","/"],{timeout:120000});
    assert.equal((await fs.stat(ownedApplication)).uid,0,"Qualify the real root-owned PKG installation.");
  } else execFileSync("/usr/bin/ditto", ["-x", "-k", baseZip, apps], {timeout:120000});
  const executable = path.join(
    apps,
    windows ? "MatiQ Companion.exe" : "MatiQ Companion.app/Contents/MacOS/MatiQ Companion",
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
    metadataName = windows ? "latest.yml" : "latest-mac.yml";
  {
    const {verifyUpdateAssets,desktopUpdateFeed}=await import('./verify-update-assets.mjs');
    const yaml=require('js-yaml'),otherDirectory=path.join(root,'other-upgrade-target');
    await verifyUpdateAssets(targetDirectory,targetVersion,process.platform,process.arch);
    await verifyUpdateAssets(otherDirectory,targetVersion,process.platform,process.arch==='arm64'?'x64':'arm64');
    const native=yaml.load(await fs.readFile(path.join(targetDirectory,metadataName),'utf8'));
    const other=yaml.load(await fs.readFile(path.join(otherDirectory,metadataName),'utf8'));
    const entries=process.arch==='arm64'?[native,other]:[other,native];
    await fs.writeFile(path.join(targetDirectory,metadataName),desktopUpdateFeed(...entries,process.platform));
  }
  const allowed = new Set([
    metadataName,
    `MatiQ-Companion-${targetVersion}-${windows ? "windows" : "mac"}-${process.arch}.${windows ? "exe" : "zip"}`,
    `MatiQ-Companion-${targetVersion}-${windows ? "windows" : "mac"}-${process.arch}.${windows ? "exe" : "zip"}.blockmap`,
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
  let runtimeLog = "";
  let app,
    handle,
    owned,
    port,
    authorizationFixture,
    failure,
    successful = false;
  const watchdog = setTimeout(() => {
    for (const process of [...processesIn(ownedApplication), ...processesIn(shipIt)])
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
    if(systemInstall)authorizationFixture=require('./ci-mac-authorization.cjs').createAuthorizationFixture();
    app = await electron.launch({
      executablePath: executable,
      args: [],
      env: {
        ...process.env,
        ELECTRON_ENABLE_LOGGING: "1",
      },
    });
    handle = app.process();
    for (const stream of [handle.stdout, handle.stderr])
      stream?.on("data", (chunk) => {
        runtimeLog = (runtimeLog + chunk.toString()).slice(-32000);
      });
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
    await app.evaluate(({ app }, { cache, url }) => {
      app.setPath("cache", cache);
      const updater =
        process.mainModule.require("electron-updater").autoUpdater;
      updater.setFeedURL({ provider: "generic", url });
      updater.disableDifferentialDownload = true;
    }, { cache: path.join(profile, "update-cache"), url: `http://127.0.0.1:${port}/` });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("button", { name: "Check for updates", exact: true })
      .click();
    await waitFor(() => page.evaluate(async (version) => {
      const state = await window.companion.call("state");
      if (state.updates.status === "error") throw Error(state.updates.message);
      return state.updates.status === "available" && state.updates.availableVersion === version;
    }, targetVersion), "Published update availability", 30000);
    assert.equal(await page.getByRole("button", { name: "Restart to update", exact: true }).isDisabled(), true);
    await page.getByRole("button", { name: "Download update", exact: true }).click();
    await waitFor(() => page.evaluate(async () => {
      const state = await window.companion.call("state");
      if (state.updates.status === "error") throw Error(state.updates.message);
      return state.updates.status === "downloaded";
    }), "Verified update download", 120000);
    assert.equal(await page.getByRole("button", { name: "Restart to update", exact: true }).isEnabled(), true);
    owned = lifecycle.capture(handle);
    await page
      .getByRole("button", { name: "Restart to update", exact: true })
      .click();
    if(authorizationFixture)await authorizationFixture.authorize();
    const launch = await waitFor(async () => {
      if ((await bundleVersion(apps)) !== targetVersion) return false;
      const processInfo = processesIn(ownedApplication).find(
        (info) =>
          info.executable === realpathSync(executable) &&
          info.pid !== handle.pid,
      );
      if (!processInfo) return false;
      const info = applicationInfo(processInfo.pid);
      if (!info.found || !info.finished || info.terminated) return false;
      const ready = processesIn(ownedApplication).find((item) => item.pid === processInfo.pid);
      if (!ready) return false;
      assert.equal(
        ready.uid,
        windows ? powershell("[Security.Principal.WindowsIdentity]::GetCurrent().User.Value") : process.getuid(),
        "The finished app must run as the same user.",
      );
      return { ...ready, version: targetVersion };
    }, "Signed replacement and automatic restart");
    assert.equal(
      await fs.realpath(applicationInfo(launch.pid).bundle),
      await fs.realpath(windows ? apps : path.join(apps, "MatiQ Companion.app")),
    );
    if(windows) await require('./verify-pe-architecture.cjs').verifyPEArchitecture(executable,process.arch);
    else {
      const nativeArch=execFileSync("/usr/bin/lipo",["-archs",executable],{encoding:"utf8",timeout:15000}).trim();
      assert.equal(nativeArch,process.arch==='x64'?'x86_64':'arm64',"The update must select the native architecture, without Rosetta masking a wrong feed entry.");
    }
    const after = {
      project: await hash(projectFile),
      settings: await hash(settings),
      model: await hash(model),
      file: await hash(generated),
    };
    assert.deepEqual(after, before, "Upgrade changed retained user data.");
    assert.equal(await fs.readFile(generated, "utf8"), marker);
    const proof = {
      platform: process.platform,
      installation:systemInstall?"system-pkg":windows?"per-user-nsis":"user-owned-zip",
      nativeArchitectureVerified:true,
      nativeAdministratorAuthorization:Boolean(authorizationFixture),
      arch: process.arch,
      baseVersion,
      targetVersion,
      signedDownloadRestart: true,
      automaticRelaunch: true,
      observation:
        windows ? "native window handle, replaced executable version and new same-user PID" : "macOS finished-launching bundle, replaced version and new same-user PID",
      dataPaths:
        "unchanged default profile and shared model store on disposable CI VM",
      baseZipSha256: await hash(baseZip),
      targetZipSha256: await hash(path.join(targetDirectory,`MatiQ-Companion-${targetVersion}-${windows ? "windows" : "mac"}-${process.arch}.${windows ? "exe" : "zip"}`)),
      retained: {
        project: true,
        settings: true,
        modelSha256: true,
        generatedFile: true,
      },
      updateFeedSha256: await hash(path.join(targetDirectory,metadataName)),
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
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    const cleanupErrors = [];
    let runtimeStopped = false;
    async function stage(label, operation) {
      try { await operation(); }
      catch (error) { cleanupErrors.push(new Error(label + ": " + error.message, {cause:error})); console.error("Upgrade cleanup failed — " + label + ": " + error.message); }
    }
    try {
      await stage("save native diagnostics", async () => {
    const diagnostic = {
      successful,
      runtimeLog,
      originalProcess: handle ? { pid: handle.pid, exitCode: handle.exitCode, signalCode: handle.signalCode } : null,
      installedVersion: await bundleVersion(apps),
      processes: [...processesIn(ownedApplication), ...processesIn(shipIt)],
      logs: {},
    };
    if(!successful && !windows) {
      let captureTimer;
      try {
        const png=await Promise.race([
          app.evaluate(async({desktopCapturer,screen})=>{const d=screen.getPrimaryDisplay();const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:d.size.width,height:d.size.height}});return sources.find(s=>s.display_id===String(d.id)).thumbnail.toPNG().toString('base64');}),
          new Promise((_,reject)=>{captureTimer=setTimeout(()=>reject(Error('Native update desktop capture timed out.')),10000);})
        ]);
        await fs.mkdir(path.join(root,'.validation'),{recursive:true});
        await fs.writeFile(path.join(root,'.validation','upgrade-desktop.png'),Buffer.from(png,'base64'));
      } catch(error) {diagnostic.captureError=error.message;console.error('Upgrade capture diagnostic:',error.message);}
      finally {clearTimeout(captureTimer);}
      try {
        diagnostic.nativeSystemLog=execFileSync('/usr/bin/log',['show','--last','4m','--style','compact','--predicate','process == "ShipIt" OR process == "SecurityAgent" OR process == "authd" OR subsystem BEGINSWITH "com.github.Squirrel"'],{encoding:'utf8',timeout:15000,maxBuffer:1024*1024}).slice(-20000);
        diagnostic.updaterJobs=execFileSync('/bin/launchctl',['list'],{encoding:'utf8',timeout:10000}).split('\n').filter(line=>/ShipIt|companion/i.test(line));
        diagnostic.authorizationElements=execFileSync('/usr/bin/osascript',['-e','tell application "System Events" to tell process "SecurityAgent" to get entire contents of window 1'],{encoding:'utf8',timeout:10000,maxBuffer:128*1024}).slice(-10000);
      } catch(error) {diagnostic.nativeLogError=error.message;console.error('Upgrade native-log diagnostic:',error.message);}
    }
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
      });
      await stage("close controlled desktop", () => cleanupDesktop({app,owned:owned?[owned]:[]}));
      // The updater relaunches independently of Playwright. Give its main
      // process a graceful quit while its renderer can still answer busy checks.
      let remaining = [];
      await stage("inspect independently relaunched runtimes", async () => { remaining = [...processesIn(ownedApplication), ...processesIn(shipIt)]; });
      for (const row of remaining) await stage("stop relaunched runtime " + row.pid, async () => {
        const directory = row.executable.startsWith(ownedApplication + path.sep) ? ownedApplication : shipIt;
        const current = () => processesIn(directory).some(candidate => candidate.pid === row.pid && candidate.uid === row.uid && candidate.executable === row.executable);
        const snapshot = lifecycle.capture({pid:row.pid});
        const controller = {
          process: () => ({pid:row.pid,exitCode:current()?null:0,signalCode:null}),
          close: async () => {
            if (!current()) return;
            if (row.executable === realpathSync(executable)) {
              if (windows) {
                assert.equal(powershell("$p=Get-Process -Id " + row.pid + ";$p.CloseMainWindow()"), "True", "The owned native app refused its quit request.");
              } else {
                const script = "ObjC.import('AppKit');var a=$.NSRunningApplication.runningApplicationWithProcessIdentifier(" + row.pid + ");if(!a||ObjC.unwrap(a.bundleURL.path)!==" + JSON.stringify(ownedApplication) + ")throw Error('The native app identity changed.');String(a.terminate);";
                assert.equal(execFileSync("/usr/bin/osascript",["-l","JavaScript","-e",script],{encoding:"utf8",timeout:10000}).trim(),"true","The owned native app refused its quit request.");
              }
            } else {
              process.kill(row.pid,"SIGTERM");
            }
            await waitFor(() => !current(), "Owned native runtime shutdown", 8000);
          },
        };
        await cleanupDesktop({app:controller,owned:[snapshot]});
      });
      await stage("independently verify runtime absence", async () => {
        if (owned) await lifecycle.verifyStopped(owned);
        assert.equal([...processesIn(ownedApplication),...processesIn(shipIt)].length,0,"Owned updater processes remain. Retain the fixture files.");
        runtimeStopped = true;
      });
      await stage("close and verify the loopback fixture", async () => {
        server.closeAllConnections();
        if (server.listening) await new Promise(resolve => server.close(resolve));
        if (port) await new Promise((resolve,reject) => {
          const socket=net.connect({host:"127.0.0.1",port});
          socket.setTimeout(1000);
          socket.once("connect",()=>{socket.destroy();reject(Error("Qualification fixture port remains open."));});
          socket.once("error",error=>{socket.destroy();error.code==="ECONNREFUSED"?resolve():reject(error);});
          socket.once("timeout",()=>{socket.destroy();reject(Error("Cannot verify qualification fixture port cleanup."));});
        });
      });
      await stage("remove owned fixture files", async () => {
        assert.ok(runtimeStopped,"Retain fixture files while runtime cleanup is unverified.");
    for (const owned of [profile, modelRoot, updaterCache]) {
      assert.equal(
        await fs.readFile(path.join(owned, ".upgrade-owner"), "utf8"),
        marker,
        "Owned cleanup marker changed; inspect before removal.",
      );
      await fs.rm(owned, { recursive: true });
    }
    if(systemInstall) {
      try {
        const stat=await fs.lstat(ownedApplication);assert.equal(stat.isSymbolicLink(),false,"Inspect the changed installed-app path before cleanup.");
        execFileSync("/usr/bin/sudo",["-n","/bin/rm","-r",ownedApplication],{timeout:60000});
      } catch(error){if(error.code!=="ENOENT")throw error;}
      execFileSync("/usr/bin/sudo",["-n","/usr/sbin/pkgutil","--forget","com.matiq.companion"],{timeout:15000});
    }
    if(windows) {
      const uninstaller=path.join(apps,'Uninstall MatiQ Companion.exe');
      await fs.access(uninstaller);
      execFileSync(uninstaller,['/S','_?='+apps],{timeout:60000});
      assert.equal(processesIn(ownedApplication).length,0,'The owned uninstaller process remains.');
    }
    if (!existingShipIt) await fs.rm(shipIt, { recursive: true, force: true });
    await fs.rm(directory, { recursive: true, force: true });
      });
    } finally {
      await stage("remove owned authorization identity", async () => authorizationFixture?.close());
      clearTimeout(watchdog);
    }
    if (cleanupErrors.length) throw new AggregateError([...(failure?[failure]:[]),...cleanupErrors],"Upgrade fixture cleanup did not pass. Inspect each owned runtime and listener failure.");
    console.log("PASS: upgrade fixture process and loopback port cleanup.");
  }
  assert.ok(successful, "The signed upgrade did not complete.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
