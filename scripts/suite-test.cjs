const {cleanupDesktop}=require('@matiq-solutions/sdk/fixture-cleanup.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {_electron:electron}=require('playwright');
const lifecycle=require('./fixture-lifecycle.cjs');
(async()=>{
 const hostRoot=process.env.MATIQ_SOLUTIONS_TEST_ROOT,packageConfig=process.env.MATIQ_SOLUTIONS_TEST_PACKAGE_CONFIG;
 if(!hostRoot||!packageConfig)throw Error('Set MATIQ_SOLUTIONS_TEST_ROOT and MATIQ_SOLUTIONS_TEST_PACKAGE_CONFIG to the reconciled host and signed fixture package.');
 const config=JSON.parse(await fs.readFile(packageConfig,'utf8')),root=await fs.mkdtemp(path.join(os.tmpdir(),'companion-suite-'));let app,owned=[],page,tool,watchdog;
 try{
 config.profile=path.join(root,'profile');const file=path.join(root,'fixture.json');await fs.writeFile(file,JSON.stringify(config));
 watchdog=setTimeout(()=>{if(app&&app.process().exitCode===null&&app.process().signalCode===null){owned=lifecycle.captureTree(lifecycle.capture(app.process()));for(const child of owned){try{process.kill(child.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')console.error(error.message);}}}process.exitCode=1;},300000);
  app=await electron.launch({args:[path.join(hostRoot,'scripts/desktop-entry.cjs')],env:{...process.env,MATIQ_FIXTURE_CONFIG:file},timeout:30000});owned=[lifecycle.capture(app.process())];page=await app.firstWindow();page.setDefaultTimeout(120000);
  await page.getByRole('button',{name:'Browse marketplace',exact:true}).click();await page.getByRole('button',{name:'Install',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Install',exact:true}).click();await page.getByText('MatiQ Companion installed. Choose Open.',{exact:true}).waitFor();await page.getByRole('button',{name:'Open',exact:true}).click();await page.evaluate(id=>window.solutions.request('open',{id}),config.catalog.tools[0].id);
  for(let attempt=0;attempt<200;attempt++){tool=app.context().pages().find(p=>p.url().includes('/src/ui/index.html'));if(tool)break;await new Promise(r=>setTimeout(r,50));}assert.ok(tool,'Installed Companion must open an actual isolated workspace.');tool.setDefaultTimeout(120000);
  await tool.getByRole('heading',{name:'Your own AI workspace.'}).waitFor();
  await tool.getByRole('button',{name:'Settings',exact:true}).click();await tool.getByRole('heading',{name:'Application updates',exact:true}).waitFor();
  await tool.getByRole('button',{name:'Choose a model',exact:true}).click();await tool.getByRole('heading',{name:'Models on your computer.',exact:true}).waitFor();
  await tool.getByRole('button',{name:'Chat',exact:true}).click();
  await tool.getByRole('button',{name:'Create a project',exact:true}).click();await tool.getByLabel('New project').fill('Suite qualification');await tool.getByRole('button',{name:'Create project',exact:true}).click();
  await tool.evaluate(()=>window.companion.call('models.select',{id:'qwen3-0.6b'}));
  await tool.getByLabel('Message Companion').fill('Reply with the word Hello.');await tool.getByRole('button',{name:'Send',exact:true}).click();await tool.locator('.message.assistant:not(#live-message)').filter({hasText:'Hello'}).waitFor({timeout:150000});
  const state=await tool.evaluate(()=>window.companion.call('state'));assert.equal(state.modelRoot,config.sharedModelRoot);assert.equal(state.updates.status,'suite');assert.equal(state.projects.length,1);
  await page.getByRole('button',{name:'Back to my tools',exact:true}).click();await page.getByRole('button',{name:'Open',exact:true}).click();await tool.getByRole('heading',{name:'Think, write and make things.'}).waitFor();assert.ok((await tool.locator('.message.assistant:not(#live-message)').innerText()).includes('Hello'));
  const nativePackage=config.catalog.tools[0].packages[process.platform+'-'+process.arch],archive=config.packages[nativePackage.url],artifacts={};for(const file of [archive,archive+'.release.json'])artifacts[path.basename(file)]=require('node:crypto').createHash('sha256').update(await fs.readFile(file)).digest('hex');
  await fs.mkdir(path.resolve('dist'),{recursive:true});await fs.writeFile(path.resolve('dist/suite-proof.json'),JSON.stringify({schema:1,version:require('../package.json').version,target:process.platform+'-'+process.arch,packageSha256:nativePackage.sha256,artifacts,checks:['trusted-native-package','explicit-install','settings-and-model-navigation','real-native-inference','isolated-project','retained-workspace','host-owned-updates']},null,2)+'\n');
  console.log('PASS: actual Companion package installed into suite, isolated project, real native inference, retained workspace and host-owned updates.');
 }catch(error){console.error('Hosted tool operation failed:',error);if(app){try{const views=[];for(const p of app.context().pages())views.push({url:p.url(),text:(await p.locator('body').innerText()).slice(-8000)});console.error('Suite integration failure:',JSON.stringify(views));}catch(e){console.error('Could not capture suite failure:',e.message);}}throw error;}
 finally{await cleanupDesktop({app,owned,temporary:root,watchdog});}
})().catch(error=>{console.error(error);process.exitCode=1;});
