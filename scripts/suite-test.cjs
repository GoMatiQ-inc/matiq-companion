const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {_electron:electron}=require('playwright');
const lifecycle=require('./fixture-lifecycle.cjs');
(async()=>{
 const hostRoot=process.env.MATIQ_SOLUTIONS_TEST_ROOT,packageConfig=process.env.MATIQ_SOLUTIONS_TEST_PACKAGE_CONFIG;
 if(!hostRoot||!packageConfig)throw Error('Set MATIQ_SOLUTIONS_TEST_ROOT and MATIQ_SOLUTIONS_TEST_PACKAGE_CONFIG to the reconciled host and signed fixture package.');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'companion-suite-')),config=JSON.parse(await fs.readFile(packageConfig,'utf8'));
 config.profile=path.join(root,'profile');const file=path.join(root,'fixture.json');await fs.writeFile(file,JSON.stringify(config));
 let app,owned,page,tool;const watchdog=setTimeout(()=>{app?.process().kill('SIGTERM');process.exitCode=1;},300000);
 try{
  app=await electron.launch({args:[path.join(hostRoot,'scripts/desktop-entry.cjs')],env:{...process.env,MATIQ_FIXTURE_CONFIG:file},timeout:30000});owned=lifecycle.capture(app.process());page=await app.firstWindow();page.setDefaultTimeout(120000);
  await page.getByRole('button',{name:'Browse marketplace',exact:true}).click();await page.getByRole('button',{name:'Install',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Install',exact:true}).click();await page.getByText('MatiQ Companion installed. Choose Open.',{exact:true}).waitFor();await page.getByRole('button',{name:'Open',exact:true}).click();
  for(let attempt=0;attempt<200;attempt++){tool=app.context().pages().find(p=>p.url().includes('/src/ui/index.html'));if(tool)break;await new Promise(r=>setTimeout(r,50));}assert.ok(tool,'Installed Companion must open an actual isolated workspace.');tool.setDefaultTimeout(120000);
  await tool.getByRole('heading',{name:'Your own AI workspace.'}).waitFor();
  await tool.getByRole('button',{name:'Create a project',exact:true}).click();await tool.getByLabel('New project').fill('Suite qualification');await tool.getByRole('button',{name:'Create project',exact:true}).click();
  await tool.evaluate(()=>window.companion.call('models.select',{id:'qwen3-0.6b'}));
  await tool.getByLabel('Message Companion').fill('Reply with the word Hello.');await tool.getByRole('button',{name:'Send',exact:true}).click();await tool.locator('.message.assistant:not(#live-message)').filter({hasText:'Hello'}).waitFor({timeout:150000});
  const state=await tool.evaluate(()=>window.companion.call('state'));assert.equal(state.modelRoot,config.sharedModelRoot);assert.equal(state.updates.status,'suite');assert.equal(state.projects.length,1);
  await page.getByRole('button',{name:'Back to my tools',exact:true}).click();await page.getByRole('button',{name:'Open',exact:true}).click();await tool.getByRole('heading',{name:'Think, write and make things.'}).waitFor();assert.ok((await tool.locator('.message.assistant:not(#live-message)').innerText()).includes('Hello'));
  console.log('PASS: actual Companion package installed into suite, isolated project, real native inference, retained workspace and host-owned updates.');
 }catch(error){if(app){try{const views=[];for(const p of app.context().pages())views.push({url:p.url(),text:(await p.locator('body').innerText()).slice(-8000)});console.error('Suite integration failure:',JSON.stringify(views));}catch(e){console.error('Could not capture suite failure:',e.message);}}throw error;}
 finally{const tree=lifecycle.captureTree(owned);await app?.close();for(const process of tree)await lifecycle.verifyStopped(process);clearTimeout(watchdog);await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
