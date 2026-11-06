const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFileSync,spawnSync}=require('node:child_process');
const yaml=require('js-yaml');
test('native release proof accepts an identical merged tree and rejects changed or incomplete evidence',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'companion-native-proof-'));
  const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000}).trim();
  try {
    git('init','-b','main');git('config','user.name','Release fixture');git('config','user.email','fixture@example.invalid');git('config','commit.gpgsign','false');
    await fs.writeFile(path.join(dir,'source.txt'),'qualified source\n');git('add','source.txt');git('commit','-m','Source');const source=git('rev-parse','HEAD');
    git('switch','-c','side');git('commit','--allow-empty','-m','Same files');git('switch','main');git('merge','--no-ff','side','-m','Merge identical source');const merged=git('rev-parse','HEAD');
    git('update-ref','refs/remotes/origin/main',merged);
    git('switch','-c','unmerged');await fs.writeFile(path.join(dir,'source.txt'),'changed source\n');git('add','source.txt');git('commit','-m','Changed source');const changed=git('rev-parse','HEAD');
    const workflow=yaml.load(await fs.readFile(path.join(__dirname,'../.github/workflows/publish-mac.yml'),'utf8'));
    const body=workflow.jobs.publish.steps.find(step=>step.name==='Require trusted qualification and exact verified artifact bytes').run;
    const start=body.indexOf('checks=json.loads('),end=body.indexOf('metadata=json.loads(');
    assert.ok(start>=0 && end>start,'Keep the actual native-proof gate covered by this fixture.');
    const program=`import json,subprocess,sys\nd=json.load(sys.stdin);repo='test/companion';sha=d['source']\ndef gh(*args):\n    return json.dumps({'workflow_runs':d['runs']} if '/checks.yml/runs?' in args[1] else {'jobs':d['jobs']})\n`+body.slice(start,end);
    const jobs=[['macos-latest','darwin','arm64'],['macos-15-intel','darwin','x64'],['windows-latest','win32','x64'],['windows-11-arm','win32','arm64']].map(([os,platform,arch])=>({name:`native (${os}, ${platform}, ${arch})`,conclusion:'success'}));
    const run={id:1,head_sha:merged,conclusion:'success',head_repository:{full_name:'test/companion'}};
    const check=(runs,qualifiedSource=source,nativeJobs=jobs)=>spawnSync(process.platform==='win32'?'python':'python3',['-c',program],{cwd:dir,encoding:'utf8',input:JSON.stringify({source:qualifiedSource,runs,jobs:nativeJobs}),timeout:20000});
    for(const candidate of [run,{...run,head_sha:source}]) {
      const result=check([candidate]);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/Qualified native source:/);
    }
    const rejected=[
      [[run],changed,jobs],
      [[{...run,head_sha:changed}],changed,jobs],
      [[{...run,conclusion:'failure'}],source,jobs],
      [[{...run,head_repository:{full_name:'untrusted/fork'}}],source,jobs],
      [[run],source,jobs.slice(0,3)],
      [[run],source,[{name:'native',conclusion:'success'}]],
    ];
    for(const [runs,qualifiedSource,nativeJobs] of rejected) {
      const result=check(runs,qualifiedSource,nativeJobs);assert.notEqual(result.status,0);assert.match(result.stderr,/Require all four native jobs on the exact complete source tree/);
    }
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
