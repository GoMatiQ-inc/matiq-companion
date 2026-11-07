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
  const selectedRoot = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "companion-selected-")));
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
  let app, owned, page, handle, writeFixture = false;
  const watchdog = setTimeout(() => {
    handle?.kill("SIGKILL");
    process.exitCode = 1;
  }, 210000);
  try {
    app = await electron.launch({
      executablePath: process.env.COMPANION_EXECUTABLE_PATH || undefined,
      args: process.env.COMPANION_EXECUTABLE_PATH
        ? []
        : [path.resolve(__dirname, "..")],
      env: { ...process.env, COMPANION_TEST_PROFILE: profile },
    });
    handle = app.process(); owned = lifecycle.capture(handle);
    page = await app.firstWindow();
    await page.getByRole("heading", {name: "What can I help you with?"}).waitFor();
    await fs.mkdir(".validation", {recursive:true});
    assert.equal((await page.evaluate(() => window.companion.call("state"))).projects.length, 0);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({path: ".validation/companion-chat-empty.png"});
    const message = page.getByLabel("Message Companion");
    await message.fill("A draft");
    await message.press("Shift+Enter"); await message.press("x");
    assert.equal(await message.inputValue(), "A draft\nx");
    if(process.env.COMPANION_FIXTURE_FAIL_WITH_DRAFT === "1")throw Error("Controlled failure with an unsent draft.");
    await page.getByText("Permissions", {exact:true}).click();
    assert.equal(await page.getByRole("checkbox").count(), 4);
    await page.getByRole("checkbox", {name:"Word and Excel"}).check();
    await waitFor(() => page.evaluate(async () => (await window.companion.call("state")).projects.some(p => p.kind === "chat")), "Conversation publication", 10000);
    const state = await page.evaluate(() => window.companion.call("state"));
    assert.equal(state.projects[0].kind, "chat");
    await waitFor(() => page.evaluate(async id => (await window.companion.call("project.open", {id})).tools.documents, state.projects[0].id), "Conversation permission persistence", 10000);
    const conversation = await page.evaluate(id => window.companion.call("project.open", {id}), state.projects[0].id);
    assert.equal(conversation.tools.search, false); assert.equal(conversation.tools.computer, false);
    await page.screenshot({path: ".validation/companion-permissions.png"});
    await page.getByRole("checkbox", {name:"Word and Excel"}).uncheck();
    await waitFor(() => page.evaluate(async id => !(await window.companion.call("project.open", {id})).tools.documents, state.projects[0].id), "Permission revocation", 10000);
    await page.getByText("Permissions", {exact:true}).click();
    await page.getByRole("button", {name:"Models", exact:true}).click();
    await page.getByRole("heading", {name:"Models on your computer."}).waitFor();
    await page.screenshot({path: ".validation/companion-models.png"});
    assert.equal(await page.evaluate(() => document.querySelector("#content").dataset.hasDraft), "true", "The close guard must retain the offscreen composer draft.");
    if (process.env.COMPANION_VALIDATION_MODELS) await page.evaluate(() => window.companion.call("models.select", {id:"qwen3-0.6b"}));
    await page.getByRole("button", {name:"Chat", exact:true}).click();
    assert.equal(await message.inputValue(), "A draft\nx", "Navigation must preserve the composer draft.");
    const attachment = path.join(selectedRoot, "attached-note.txt"); await fs.writeFile(attachment, "The required answer is Hello.");
    await app.evaluate(({dialog}, file) => {
      globalThis.restorePicker = dialog.showOpenDialog;
      dialog.showOpenDialog = async (_window, options) => {
        if (!options.properties.includes("openFile") || !options.properties.includes("multiSelections")) throw Error("Use a native multiple-file picker.");
        return {canceled:false,filePaths:[file]};
      };
    }, attachment);
    await page.getByRole("button", {name:"Attach files", exact:true}).click();
    await page.getByRole("button", {name:"Remove attachment attached-note.txt"}).waitFor();
    const attached = await page.evaluate(id => window.companion.call("project.open", {id}), state.projects[0].id);
    assert.equal(attached.grants[0].write, false);
    assert.equal(attached.grants[0].root, attachment);
    await app.evaluate(({dialog}) => {dialog.showOpenDialog = globalThis.restorePicker;});
    if (process.env.COMPANION_VALIDATION_MODELS) {
      await message.fill("Read the attached note and reply with the required answer.");
      await message.press("Enter");
      await page.locator(".message.assistant:not(#live-message)").filter({hasText:"Hello"}).waitFor({timeout:150000});
      await waitFor(() => page.evaluate(async () => !(await window.companion.call("state")).busy), "Completed chat persistence", 10000);
      assert.equal(await message.inputValue(), "");
      const saved = await page.evaluate(id => window.companion.call("project.open", {id}), state.projects[0].id);
      assert.match(saved.messages[0].text, /The required answer is Hello/);
      assert.equal(saved.messages[0].attachments[0].name, "attached-note.txt");
      assert.equal(saved.messages.filter(m => m.role === "user").length, 1, "Enter sends exactly once.");
      console.log("PASS: Enter sends a real local-model turn with selected-file contents; Shift+Enter preserves a newline.");
    } else {
      await page.getByRole("button", {name:"Remove attachment attached-note.txt"}).click();
      await message.fill("");
    }
    await page.screenshot({path: ".validation/companion-chat.png"});
    await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setSize(840,620));
    await page.screenshot({path: ".validation/companion-chat-compact.png"});
    const geometry = await page.evaluate(() => {
      const box = document.querySelector(".composer").getBoundingClientRect();
      const header = document.querySelector(".workspace").getBoundingClientRect();
      return {center:box.x+box.width/2,workspaceCenter:header.x+header.width/2,bottom:box.bottom,height:innerHeight};
    });
    assert.ok(Math.abs(geometry.center-geometry.workspaceCenter)<2, "Center the conversation in the workspace.");
    assert.ok(geometry.height-geometry.bottom<100, "Keep the composer at the bottom of the chat.");
    await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setSize(1160,820));
    await page.getByRole("button", {name:"New chat", exact:true}).click();
    await page.getByRole("heading", {name:"What can I help you with?"}).waitFor();
    assert.equal(await message.inputValue(), "");
    if (process.env.COMPANION_VALIDATION_MODELS) {
      await page.locator(".chat-history").first().click();
      await page.locator(".message.assistant:not(#live-message)").filter({hasText:"Hello"}).waitFor();
      await page.getByRole("button", {name:"New chat", exact:true}).click();
    }
    await page.getByRole("button", {name:"Projects", exact:true}).click();
    assert.equal(await page.getByRole("button", {name:"Open project",exact:true}).count(), 0, "Ordinary chats are not projects.");
    await page.getByLabel("New project").fill("Optional project");
    await page.getByRole("button", {name:"Create project",exact:true}).click();
    await page.getByLabel("Message Companion").waitFor();
    const projects = (await page.evaluate(() => window.companion.call("state"))).projects;
    assert.equal(projects.filter(p => p.kind === "project").length, 1);
    console.log("PASS: immediate chat, optional projects, scoped attachments, composer permissions, draft preservation and centered layout.");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Download update", exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "Restart to update", exact: true }).isDisabled(), true);
    console.log(
      "PASS: real Electron navigation, project persistence, independent tool toggles and model setup screen.",
    );
    await app.evaluate(({app,dialog})=>{
      const require=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json');
      const fs=require('node:fs/promises'),rename=fs.rename,show=dialog.showErrorBox;let held=false;
      globalThis.fixturePendingWrite=false;globalThis.fixtureCloseError='';
      fs.rename=async(...args)=>{if(!held&&String(args[1]).endsWith('project.json')){held=true;globalThis.fixturePendingWrite=true;await new Promise(resolve=>{globalThis.fixtureReleaseWrite=resolve;});}return rename(...args);};
      dialog.showErrorBox=(_title,message)=>{globalThis.fixtureCloseError=message;};
      globalThis.fixtureRestoreWrite=()=>{globalThis.fixtureReleaseWrite?.();fs.rename=rename;dialog.showErrorBox=show;};
    });
    writeFixture = true;
    const pending=page.evaluate(id=>window.companion.call('project.policy',{id,tool:'documents',enabled:true}),state.projects[0].id);
    await waitFor(()=>app.evaluate(()=>globalThis.fixturePendingWrite),'Pending project write reached its commit',10000);
    await app.evaluate(({app})=>app.quit());
    await waitFor(()=>app.evaluate(()=>globalThis.fixtureCloseError.includes('current Companion request')),'Close refusal while project write is pending',10000);
    assert.equal(await page.evaluate(()=>document.documentElement.inert),false);
    assert.equal(JSON.parse(await fs.readFile(path.join(profile,'projects',state.projects[0].id,'project.json'))).tools.documents,false);
    await app.evaluate(()=>globalThis.fixtureReleaseWrite());await pending;
    assert.equal(JSON.parse(await fs.readFile(path.join(profile,'projects',state.projects[0].id,'project.json'))).tools.documents,true);
    await app.evaluate(()=>globalThis.fixtureRestoreWrite());
    console.log('PASS: standalone close waits for a pending project commit and preserves its completed write.');

  } catch(error) {
    console.error("Desktop journey failed:", error);
    if(page) {
      try {
        await fs.mkdir('.validation',{recursive:true});
        await fs.writeFile(`.validation/desktop-${process.platform}-${process.arch}-failure.json`,JSON.stringify({error:error.message,body:(await page.locator('body').innerText()).slice(-10000)},null,2)+'\n');
        await page.screenshot({path:`.validation/desktop-${process.platform}-${process.arch}-failure.png`});
      } catch(diagnosticError){console.error('Could not retain desktop failure evidence:',diagnosticError.message);}
    }
    throw error;
  } finally {
    const tree = lifecycle.captureTree(owned);
    let closeTimer, closeError;
    try {
      if(writeFixture)await app.evaluate(()=>globalThis.fixtureRestoreWrite?.()).catch(error=>console.error('Write fixture restoration failed:',error.message));
      if(app) {
        try {
          await Promise.race([app.close(), new Promise((_,reject) => {
            closeTimer = setTimeout(() => reject(Error("Normal fixture close timed out.")), 10000);
          })]);
        } catch(error) {
          closeError = error;
          // Signal only the original controlled child handle, never an arbitrary/reused PID.
          if(handle && handle.exitCode === null && handle.signalCode === null) handle.kill("SIGKILL");
        }
      }
      const failures=[];
      for(const snapshot of tree) {
        try {await lifecycle.stopOwned(snapshot);}catch(error){failures.push(error);}
      }
      for(const snapshot of tree) {
        try {await lifecycle.verifyStopped(snapshot);}catch(error){failures.push(error);}
      }
      if(failures.length)throw new AggregateError(failures, "Owned runtime cleanup failed; retain the fixture for inspection.");
      await fs.rm(profile, {recursive:true,force:true});
      await fs.rm(selectedRoot, {recursive:true,force:true});
      if(closeError)throw closeError;
    } finally {
      clearTimeout(closeTimer);
      clearTimeout(watchdog);
    }
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
