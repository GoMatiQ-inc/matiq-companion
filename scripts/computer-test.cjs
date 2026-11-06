const lifecycle = require('./fixture-lifecycle.cjs');
const {_electron: electron} = require('playwright');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
(async()=>{
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'companion-computer-'));
  let app,target,ownedApp,ownedTarget;
  const timer=setTimeout(()=>{app?.process().kill();target?.process().kill();process.exitCode=1;},90000);
  try {
    app=await electron.launch({executablePath:process.env.COMPANION_EXECUTABLE_PATH||undefined,args:process.env.COMPANION_EXECUTABLE_PATH?[]:[path.resolve(__dirname,'..')],env:{...process.env,COMPANION_TEST_PROFILE:profile}});
    ownedApp=lifecycle.capture(app.process());
    const main=await app.firstWindow();
    await main.getByRole('heading',{name:'Your own AI workspace.'}).waitFor();
    const entry=path.join(profile,'target.cjs');
    const html='<html><body style="background:white;color:black;font:40px sans-serif"><p>Companion computer verification</p><label for="target">TARGET</label><input id="target" style="display:block;font:28px sans-serif;width:650px"><button id="confirm" style="background:#eee;color:black;border:0;padding:24px;margin-top:30px;font:48px sans-serif">Verify</button><script>window.clicks=0;window.trustedMouse=false;window.trustedKey=false;document.addEventListener("mousedown",e=>window.trustedMouse=e.isTrusted);document.addEventListener("keydown",e=>window.trustedKey=e.isTrusted);document.getElementById("confirm").onclick=()=>window.clicks++;</script></body></html>';
    await fs.writeFile(entry,`const {app,BrowserWindow,screen}=require('electron');app.setName('Companion Input Target');app.setPath('userData',${JSON.stringify(path.join(profile,'target-profile'))});app.whenReady().then(async()=>{const area=screen.getPrimaryDisplay().workArea;const window=new BrowserWindow({width:800,height:600,x:area.x+40,y:area.y+60,alwaysOnTop:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});await window.loadURL('data:text/html,'+encodeURIComponent(${JSON.stringify(html)}));window.show();app.focus({steal:true});window.focus();});app.on('window-all-closed',()=>app.quit());`);
    target=await electron.launch({executablePath:require('electron'),args:[entry]});
    ownedTarget=lifecycle.capture(target.process());
    assert.notEqual(ownedTarget.pid,ownedApp.pid);
    const page=await target.firstWindow();
    await page.getByText('Companion computer verification',{exact:true}).waitFor();
    await page.evaluate(()=>document.fonts.ready);
    await app.evaluate(({app,BrowserWindow})=>{
      globalThis.__computer=process.mainModule.require(app.getAppPath()+'/src/computer.cjs').createComputer(BrowserWindow.getAllWindows()[0]);
    });
    const act=(name,args={})=>app.evaluate(async(_,{name,args})=>globalThis.__computer(name,args,new AbortController().signal),{name,args});
    const observed=await act('observe_screen');
    const label=observed.words.find(w=>/^target$/i.test(w.text));
    if(!label) {
      const geometry=await target.evaluate(({BrowserWindow,screen})=>({bounds:BrowserWindow.getAllWindows()[0].getBounds(),display:screen.getPrimaryDisplay().bounds,focused:BrowserWindow.getAllWindows()[0].isFocused()}));
      const b=geometry.bounds,d=geometry.display;
      const words=observed.words.filter(w=>w.x>=b.x-d.x&&w.x<b.x-d.x+b.width&&w.y>=b.y-d.y&&w.y<b.y-d.y+b.height).map(w=>w.text);
      throw Error('OCR did not locate the independent target: '+JSON.stringify({words,...geometry}));
    }
    await act('click_screen',{x:label.x,y:label.y});
    assert.equal(await page.evaluate(()=>document.activeElement.id),'target','Native pointer click must focus the other process input.');
    await assert.rejects(act('type_text',{text:'must not type'}),/Observe the screen again/);
    await act('observe_screen');
    await act('type_text',{text:process.platform==='linux'?'Local input verified!':'Local input verified café!'});
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
    await fs.writeFile(path.join('.validation',`computer-${process.platform}-${process.arch}-${runtime.packaged?'packaged':'development'}.json`),JSON.stringify({platform:process.platform,arch:process.arch,...received,...runtime,separateTargetProcess:true,staleRejected:true},null,2)+'\n');
    console.log('PASS: real screen OCR, pointer focus/click, text and key input into a separate application process; stale observations rejected.');
  } catch(error) {
    await fs.mkdir('.validation',{recursive:true});
    await fs.writeFile(path.join('.validation',`computer-${process.platform}-${process.arch}-failure.json`),JSON.stringify({platform:process.platform,arch:process.arch,error:error.message},null,2)+'\n');
    throw error;
  } finally {
    await app?.close();await target?.close();
    await lifecycle.verifyStopped(ownedApp);await lifecycle.verifyStopped(ownedTarget);
    clearTimeout(timer);await fs.rm(profile,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
