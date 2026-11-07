const { fork } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const lifecycle = require("./fixture-lifecycle.cjs");
const { Projects } = require("../src/projects.cjs");
const { Tools } = require("../src/tools.cjs");
const { MODELS } = require("../src/catalog.cjs");
const { ModelStore } = require("../src/models.cjs");
const { readWord } = require("../src/documents.cjs");
(async () => {
  if (!process.env.COMPANION_VALIDATION_MODELS)
    throw Error("Set COMPANION_VALIDATION_MODELS to an isolated, verified model store.");
  const store = new ModelStore(process.env.COMPANION_VALIDATION_MODELS);
  assert.ok(await store.verify(MODELS[0]));
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "companion-tools-")));
  let child, owned, runtime, diagnostics = "", phase="document tool", stage="starting-worker", chunks=0, runtimeInitializations=0;
  const watchdog = setTimeout(() => { process.exitCode=1;child?.kill("SIGKILL"); },300000);
  try {
    const projects = new Projects(path.join(dir, "projects"));
    const project = await projects.create("Tool verification");
    project.tools.documents = true;
    await projects.save(project);
    let calls = 0, observations = 0;
    const tools = new Tools({projects,approve:async request=>{
      assert.equal(request.name,"create_word");calls++;return true;
    }});
    const executable=process.env.COMPANION_EXECUTABLE_PATH || require("electron");
    const worker=process.env.COMPANION_EXECUTABLE_PATH
      ? path.join(path.dirname(executable),process.platform==='darwin'?'../Resources':'resources','app.asar','src','inference-worker.cjs')
      : path.join(__dirname,'../src/inference-worker.cjs');
    const bootstrap=path.join(dir,'worker.cjs');
    await fs.writeFile(bootstrap,`process.send({type:'fixture-runtime',node:process.versions.node,electron:process.versions.electron});require(${JSON.stringify(worker)});`);
    child=fork(bootstrap,[],{execPath:executable,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:['ignore','ignore','pipe','ipc']});
    owned=lifecycle.capture(child);
    child.stderr.on('data',bytes=>{diagnostics=(diagnostics+bytes).slice(-3000);});
    child.on('message',message=>{if(message.type==='fixture-runtime'){runtime=message;console.log('Actual worker runtime:',JSON.stringify(runtime));}if(message.type==='stage'){stage=message.stage;if(stage==='initializing-runtime')runtimeInitializations++;console.log('Worker stage:',phase,stage);}if(message.type==='chunk')chunks++;});
    const prompt=message=>new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>finish(Error('Worker prompt timed out: '+JSON.stringify({phase,stage,chunks,runtime,diagnostics}))),150000);
      const finish=(error,value)=>{
        clearTimeout(timer);child.off('error',onError);child.off('exit',onExit);child.off('message',onMessage);
        error?reject(error):resolve(value);
      };
      const onError=error=>finish(error);
      const onExit=(code,signal)=>finish(Error(`Worker exited before completing its response (${code??signal}): ${diagnostics}`));
      const onMessage=async m=>{
        if(m.type==='tool'){
          try {
            let result;
            if(m.name==='observe_screen') {
              observations++;
              result={width:1920,height:1080,text:'Large native OCR result '.repeat(1000),
                words:Array.from({length:300},(_,i)=>({text:'word-'+i,x:i,y:i+20,confidence:99}))};
            } else {
              assert.equal(m.name,'create_word');assert.equal(m.args.path,'proof.docx');
              result=await tools.run(project.id,m.name,m.args);
            }
            child.send({type:'tool-result',id:m.id,result});
          } catch(error){finish(error);}
        } else if(m.type==='error')finish(Error(m.error));
        else if(m.type==='done')finish(null,m.text);
      };
      child.on('error',onError);child.on('exit',onExit);child.on('message',onMessage);
      child.send({type:'prompt',history:[],...message});
    });
    child.send({type:'probe'});
    await prompt({
      modelPath:store.location(MODELS[0]),
      tools:tools.definitions(project).filter(t=>t.name==='create_word'),
      system:'You are a local file assistant. Use create_word when asked for a document. Never merely describe doing the task. /no_think',
      text:'Call create_word now with path "proof.docx", title "Verification", paragraphs ["Local tools work."]. After the tool succeeds, say Done.'
    });
    assert.ok(calls>0,'The real model must invoke the actual document tool.');
    assert.ok(JSON.stringify(readWord(await fs.readFile(path.join(projects.folder(project.id),'files','proof.docx')))).includes('Local tools work.'));
    phase='large OCR tool result';chunks=0;
    const observed=await prompt({
      modelPath:store.location(MODELS[0]),
      tools:tools.definitions({...project,tools:{...project.tools,computer:true}}).filter(t=>['observe_screen','click_screen','type_text','press_key'].includes(t.name)),
      system:'You are a local desktop assistant. Use observe_screen when asked. After receiving its result, answer briefly. /no_think',
      text:'Call observe_screen now with arguments {} to inspect the disposable TextEdit document labelled MATIQ NATIVE ACCEPTANCE TARGET. Do not claim to have observed it without using the tool. Do not change any files or settings.'
    });
    assert.ok(observations>0,'The real model must request the oversized screen observation; returned: '+JSON.stringify(observed));
    // prompt resolves only on the production worker's done event; tool-only turns may have no final prose.
    const alternate=path.join(dir,'verified-weight-alias.gguf');
    try {await fs.link(store.location(MODELS[0]),alternate);} catch(error){if(error.code!=='EXDEV')throw error;await fs.copyFile(store.location(MODELS[0]),alternate);}
    for(let iteration=0;iteration<5;iteration++){
      phase=`model reload ${iteration+1}`;chunks=0;
      const text=await prompt({modelPath:iteration%2===0?alternate:store.location(MODELS[0]),tools:[],system:'Answer briefly. /no_think',text:'Reply with the word Hello.'});
      assert.ok(text.trim(),'The reloaded worker must return actual model output.');
    }
    assert.equal(runtimeInitializations,1,'Concurrent hardware probing and chat must share one native runtime initialization.');
    assert.equal(runtime?.electron,require('electron/package.json').version,'Use the exact Electron runtime shipped with Companion.');
    assert.equal(Number(runtime.node.split('.')[0]),24,'Qualify the embedded Node major used by the app.');
    await fs.mkdir('.validation',{recursive:true});
    await fs.writeFile(path.join('.validation',`worker-lifetimes-${process.platform}-${process.arch}-${process.env.COMPANION_EXECUTABLE_PATH?'packaged':'development'}.json`),JSON.stringify({platform:process.platform,arch:process.arch,workerNode:runtime.node,electron:runtime.electron,toolCalls:calls,oversizedOcrObservations:observations,completedModelReloads:5,runtimeInitializations,packaged:Boolean(process.env.COMPANION_EXECUTABLE_PATH)},null,2)+'\n');
    console.log('PASS: actual Electron worker completed document tool, full document/lifetime responses, bounded oversized OCR turn and five native model unload/reload cycles.');
  } finally {
    const tree=lifecycle.captureTree(owned);
    if(child && child.exitCode===null && child.signalCode===null){
      const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();
      let timer;
      try {await Promise.race([exited,new Promise((_,reject)=>{timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Inference child did not exit.'));},5000);})]);}
      finally {clearTimeout(timer);}
    }
    for(const process of tree)await lifecycle.verifyStopped(process);
    clearTimeout(watchdog);await fs.rm(dir,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
