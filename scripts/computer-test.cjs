const lifecycle = require('./fixture-lifecycle.cjs');
const {_electron: electron} = require('playwright');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync}=require('node:child_process');
(async()=>{
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'companion-computer-'));
  let app,target,ownedApp,ownedTarget;
  const timer=setTimeout(()=>{app?.process().kill();target?.process().kill();process.exitCode=1;},150000);
  try {
    app=await electron.launch({executablePath:process.env.COMPANION_EXECUTABLE_PATH||undefined,args:process.env.COMPANION_EXECUTABLE_PATH?[]:[path.resolve(__dirname,'..')],env:{...process.env,COMPANION_TEST_PROFILE:profile}});
    ownedApp=lifecycle.capture(app.process());
    const main=await app.firstWindow();
    await main.getByRole('heading',{name:'Your own AI workspace.'}).waitFor();
    await app.evaluate(({app,BrowserWindow})=>{
      globalThis.__computer=process.mainModule.require(app.getAppPath()+'/src/computer.cjs').createComputer(BrowserWindow.getAllWindows()[0]);
    });
    const act=(name,args={})=>app.evaluate(async(_,{name,args})=>globalThis.__computer(name,args,new AbortController().signal),{name,args});
    const initialAccess=await app.evaluate(({app})=>process.mainModule.require(app.getAppPath()+'/src/computer-access.cjs').computerAccess());
    await fs.mkdir('.validation',{recursive:true});await fs.writeFile(path.join('.validation',`computer-${process.platform}-${process.arch}-access.json`),JSON.stringify(initialAccess,null,2)+'\n');
    const desktopPreparation={attempted:false,togglesDisabled:0,pages:0};
    if(process.env.GITHUB_ACTIONS==='true' && process.env.RUNNER_ENVIRONMENT==='github-hosted' && process.platform==='win32' && process.arch==='arm64') {
      let setup=await act('observe_screen');
      for(let step=0;step<12 && /Choose\s+privacy\s+settings/i.test(setup.text);step++) {
        desktopPreparation.attempted=true;
        const png=await app.evaluate(async({desktopCapturer,screen})=>{const d=screen.getPrimaryDisplay();const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:d.size.width,height:d.size.height}});return sources.find(s=>s.display_id===String(d.id)).thumbnail.toPNG().toString('base64');});
        await fs.mkdir('.validation',{recursive:true});await fs.writeFile('.validation/computer-win32-arm64-initial-privacy.png',Buffer.from(png,'base64'));
        assert.equal(setup.width,1024,'Inspect the changed CI setup layout before automating it.');
        assert.equal(setup.height,768,'Inspect the changed CI setup layout before automating it.');
        const yes=setup.words.filter(w=>/^yes$/i.test(w.text));
        if(yes.length) {
          // The inspected first-run layout places each toggle 40 logical pixels left of its Yes label.
          await act('click_screen',{x:yes[0].x-40,y:yes[0].y});
          const changed=await act('observe_screen');
          assert.equal(changed.words.filter(w=>/^yes$/i.test(w.text)).length,yes.length-1,'The optional CI privacy switch did not turn off. Inspect before continuing.');
          desktopPreparation.togglesDisabled++;setup=changed;
        } else {
          const wordsText=setup.words.map(w=>w.text).join(' ');
          const inspectedFinal=desktopPreparation.pages>=1 && /Personalized offers/i.test(wordsText) && /Select Learn more/i.test(wordsText);
          const inspectedPage=desktopPreparation.togglesDisabled>=2 && desktopPreparation.togglesDisabled<=3 && (desktopPreparation.pages===0 || inspectedFinal);
          const next=setup.words.find(w=>/^(next|accept)$/i.test(w.text) && w.x>setup.width*0.7 && w.y>setup.height*0.75) || (inspectedPage ? {x:867,y:656} : null);
          assert.ok(next,'The CI privacy page is unfamiliar. Inspect the screen before continuing: '+JSON.stringify({desktopPreparation,words:setup.words.map(w=>w.text)}));
          await act('click_screen',{x:next.x,y:next.y});desktopPreparation.pages++;
          setup=await act('observe_screen');
        }
      }
      assert.doesNotMatch(setup.text,/Choose\s+privacy\s+settings/i,'The CI first-run privacy experience did not complete.');
      await fs.mkdir('.validation',{recursive:true});
      await fs.writeFile('.validation/desktop-preparation-win32-arm64.json',JSON.stringify(desktopPreparation,null,2)+'\n');
    }
    const entry=path.join(profile,'target.cjs');
    const html='<html><body style="background:white;color:black;font:40px sans-serif"><p>Companion computer verification</p><label for="target">ENTRY</label><input id="target" style="display:block;font:28px sans-serif;width:650px"><button id="confirm" style="background:#eee;color:black;border:0;padding:24px;margin-top:30px;font:48px sans-serif">Verify</button><script>window.clicks=0;window.trustedMouse=false;window.trustedKey=false;document.addEventListener("mousedown",e=>window.trustedMouse=e.isTrusted);document.addEventListener("keydown",e=>window.trustedKey=e.isTrusted);document.getElementById("confirm").onclick=()=>window.clicks++;</script></body></html>';
    await fs.writeFile(entry,`const {app,BrowserWindow,screen}=require('electron');app.setName('Companion Input Target');app.setPath('userData',${JSON.stringify(path.join(profile,'target-profile'))});app.whenReady().then(async()=>{if(process.platform==='darwin')app.setActivationPolicy('regular');const area=screen.getPrimaryDisplay().workArea;const window=new BrowserWindow({width:800,height:600,x:area.x+40,y:area.y+60,alwaysOnTop:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});await window.loadURL('data:text/html,'+encodeURIComponent(${JSON.stringify(html)}));window.show();app.focus({steal:true});window.focus();});app.on('window-all-closed',()=>app.quit());`);
    let targetExecutable=require('electron');
    if(process.platform==='darwin') {
      const bundle=path.resolve(targetExecutable,'../../..'),copy=path.join(profile,'Companion Input Target.app');
      execFileSync('/usr/bin/ditto',[bundle,copy],{timeout:90000});
      const plist=path.join(copy,'Contents/Info.plist');
      execFileSync('/usr/bin/plutil',['-replace','CFBundleIdentifier','-string','com.matiq.companion.input-fixture',plist],{timeout:15000});
      execFileSync('/usr/bin/codesign',['--force','--deep','--sign','-','--timestamp=none',copy],{timeout:90000});
      assert.equal(execFileSync('/usr/bin/plutil',['-extract','CFBundleIdentifier','raw','-o','-',plist],{encoding:'utf8'}).trim(),'com.matiq.companion.input-fixture');
      targetExecutable=path.join(copy,'Contents/MacOS/Electron');
    }
    target=await electron.launch({executablePath:targetExecutable,args:[entry]});
    ownedTarget=lifecycle.capture(target.process());
    assert.notEqual(ownedTarget.pid,ownedApp.pid);
    const page=await target.firstWindow();
    await page.getByText('Companion computer verification',{exact:true}).waitFor();
    await page.evaluate(()=>document.fonts.ready);
    let observed=await act('observe_screen');
    if(process.env.GITHUB_ACTIONS==='true' && process.env.RUNNER_ENVIRONMENT==='github-hosted' && process.platform==='win32' && process.arch==='arm64') {
      const startMenu=words=>words.some(w=>/^Pinned$/i.test(w.text)) && words.some(w=>/^Recommended$/i.test(w.text));
      if(startMenu(observed.words)) {
        await act('press_key',{key:'Escape'});
        observed=await act('observe_screen');
        assert.equal(startMenu(observed.words),false,'The inspected CI Start menu did not close. Inspect before continuing.');
        desktopPreparation.startMenuDismissed=true;
      }
    }
    const label=observed.words.find(w=>/^entry$/i.test(w.text));
    if(!label) {
      if(process.env.GITHUB_ACTIONS==='true' && process.env.RUNNER_ENVIRONMENT==='github-hosted' && process.platform==='win32' && process.arch==='arm64' && /Choose privacy settings/i.test(observed.text)) {
        const png=await app.evaluate(async({desktopCapturer,screen})=>{const display=screen.getPrimaryDisplay();const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:display.size.width,height:display.size.height}});return sources.find(s=>s.display_id===String(display.id)).thumbnail.toPNG().toString('base64');});
        await fs.mkdir('.validation',{recursive:true});await fs.writeFile('.validation/computer-win32-arm64-initial-privacy.png',Buffer.from(png,'base64'));
      }
      const geometry=await target.evaluate(({BrowserWindow,screen})=>({bounds:BrowserWindow.getAllWindows()[0].getBounds(),display:screen.getPrimaryDisplay().bounds,focused:BrowserWindow.getAllWindows()[0].isFocused()}));
      const b=geometry.bounds,d=geometry.display;
      const words=observed.words.filter(w=>w.x>=b.x-d.x&&w.x<b.x-d.x+b.width&&w.y>=b.y-d.y&&w.y<b.y-d.y+b.height).map(w=>w.text);
      throw Error('OCR did not locate the independent target: '+JSON.stringify({words,...geometry}));
    }
    await act('click_screen',{x:label.x,y:label.y});
    let focusClicks=1;
    if(await page.evaluate(()=>document.activeElement.id)!=='target') {
      // Some inactive applications consume the first mouse click solely for activation.
      const fresh=await act('observe_screen'),again=fresh.words.find(w=>/^entry$/i.test(w.text));
      assert.ok(again,'Observe the field again before the activation follow-up click.');
      await act('click_screen',{x:again.x,y:again.y});focusClicks++;
    }
    const focus=await page.evaluate(()=>({element:document.activeElement.id,mouse:window.trustedMouse}));
    if(focus.element!=='target') {
      const pointer=await app.evaluate(({screen})=>screen.getCursorScreenPoint());
      const bounds=await target.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getContentBounds());
      throw Error('Native pointer did not focus the other process: '+JSON.stringify({focus,pointer,label,bounds,initialAccess,appPid:app.process().pid,targetPid:target.process().pid}));
    }
    await assert.rejects(act('type_text',{text:'must not type'}),/Observe the screen again/);
    await act('observe_screen');
    await act('type_text',{text:process.platform==='linux'?'Local input verified!':'Local input verified café!'});
    assert.equal(await target.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFocused()),true,'Keep the approved target focused after queued typing.');
    await act('observe_screen');
    await act('press_key',{key:'Backspace'});
    await act('observe_screen');
    // OCR chose the first target; independent fixture geometry isolates the final native click assertion from OCR segmentation.
    const button=await page.locator('#confirm').evaluate(element=>{const r=element.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
    const offset=await target.evaluate(({BrowserWindow,screen})=>{const b=BrowserWindow.getAllWindows()[0].getContentBounds(),d=screen.getPrimaryDisplay().bounds;return {x:b.x-d.x,y:b.y-d.y};});
    await act('click_screen',{x:offset.x+button.x,y:offset.y+button.y});
    const received=await page.evaluate(()=>({value:document.getElementById('target').value,clicks:window.clicks,trustedMouse:window.trustedMouse,trustedKey:window.trustedKey}));
    assert.match(observed.text,/computer verification/i);
    assert.equal(received.value,process.platform==='linux'?'Local input verified':'Local input verified café');
    assert.equal(received.clicks,1);assert.equal(received.trustedMouse,true);assert.equal(received.trustedKey,true);
    const runtime=await app.evaluate(({app,screen})=>({access:process.mainModule.require(app.getAppPath()+'/src/computer-access.cjs').computerAccess(),scaleFactor:screen.getPrimaryDisplay().scaleFactor,packaged:app.isPackaged}));
    await fs.mkdir('.validation',{recursive:true});
    await fs.writeFile(path.join('.validation',`computer-${process.platform}-${process.arch}-${runtime.packaged?'packaged':'development'}.json`),JSON.stringify({platform:process.platform,arch:process.arch,...received,...runtime,separateTargetProcess:true,focusClicks,desktopPreparation,staleRejected:true},null,2)+'\n');
    console.log('PASS: real screen OCR, pointer focus/click, text and key input into a separate application process; stale observations rejected.');
  } catch(error) {
    await fs.mkdir('.validation',{recursive:true});
    await fs.writeFile(path.join('.validation',`computer-${process.platform}-${process.arch}-failure.json`),JSON.stringify({platform:process.platform,arch:process.arch,error:error.message,appPid:app?.process().pid,targetPid:target?.process().pid},null,2)+'\n');
    throw error;
  } finally {
    const tree=[...lifecycle.captureTree(ownedApp),...lifecycle.captureTree(ownedTarget)];
    await app?.close();await target?.close();
    for(const process of tree)await lifecycle.verifyStopped(process);
    clearTimeout(timer);await fs.rm(profile,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
