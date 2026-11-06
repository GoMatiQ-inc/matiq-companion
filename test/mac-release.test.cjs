const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
test('Mac publication combines qualified architectures and refuses altered installer bytes',async t=>{
 const {prepareMacRelease}=await import('../scripts/prepare-mac-release.mjs');
 const yaml=require('js-yaml'),root=await fs.mkdtemp(path.join(os.tmpdir(),'companion-release-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const input=path.join(root,'in');await fs.mkdir(input);
 for(const arch of ['arm64','x64']) {
  const dir=path.join(input,arch);await fs.mkdir(dir);
  const pkg=`MatiQ-Companion-0.1.1-mac-${arch}.pkg`,zip=`MatiQ-Companion-0.1.1-mac-${arch}.zip`,bytes=Buffer.from(arch);
  const metadata={version:'0.1.1',files:[{url:zip,size:bytes.length,sha512:createHash('sha512').update(bytes).digest('base64')}]};
  const data={[pkg]:Buffer.from('installer-'+arch),[zip]:bytes,'latest-mac.yml':Buffer.from(yaml.dump(metadata))};
  const assets={};for(const [name,body] of Object.entries(data)){await fs.writeFile(path.join(dir,name),body);assets[name]=createHash('sha256').update(body).digest('hex');}
  await fs.writeFile(path.join(dir,'mac-signature.json'),JSON.stringify({version:'0.1.1',arch,platform:'darwin',artifact:pkg,signed:true,notarized:true,stapled:true,assets,sha256:assets[pkg]}));
  const retained={project:true,settings:true,modelSha256:true,generatedFile:true};
  const proof={arch,baseVersion:'0.1.1',signedDownloadRestart:true,automaticRelaunch:true,retained,baseZipSha256:assets[zip]};
  await fs.writeFile(path.join(dir,'upgrade-proof.json'),JSON.stringify(proof));
  if(arch==='arm64')await fs.writeFile(path.join(input,'published-upgrade-proof.json'),JSON.stringify({...proof,baseVersion:'0.1.0',targetVersion:'0.1.1',targetZipSha256:assets[zip]}));
 }
 const output=path.join(root,'out');await prepareMacRelease(input,output,'0.1.1');
 const merged=yaml.load(await fs.readFile(path.join(output,'latest-mac.yml'),'utf8'));assert.equal(merged.files.length,2);assert.match(merged.files[0].url,/arm64/);assert.match(merged.files[1].url,/x64/);
 await fs.writeFile(path.join(input,'x64','MatiQ-Companion-0.1.1-mac-x64.pkg'),'tampered');
 await assert.rejects(prepareMacRelease(input,path.join(root,'bad'),'0.1.1'),/Unverified artifact bytes/);
 await assert.rejects(fs.stat(path.join(root,'bad')),{code:'ENOENT'});
});
