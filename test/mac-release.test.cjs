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
  const tool=`MatiQ-Companion-0.1.1-darwin-${arch}.mqt`,toolData={[tool]:Buffer.from('qualified-tool-'+arch),[tool+'.release.json']:Buffer.from('qualified-descriptor-'+arch)},toolArtifacts={};
  for(const [name,body] of Object.entries(toolData)){await fs.writeFile(path.join(dir,name),body);toolArtifacts[name]=createHash('sha256').update(body).digest('hex');}
  await fs.writeFile(path.join(dir,'suite-proof.json'),JSON.stringify({version:'0.1.1',target:'darwin-'+arch,packageSha256:toolArtifacts[tool],artifacts:toolArtifacts,checks:['trusted-native-package','explicit-install','real-native-inference','retained-workspace','host-owned-updates']}));
  const retained={project:true,settings:true,modelSha256:true,generatedFile:true};
  const proof={arch,installation:'system-pkg',nativeAdministratorAuthorization:true,baseVersion:'0.1.1',signedDownloadRestart:true,automaticRelaunch:true,retained,baseZipSha256:assets[zip]};
  await fs.writeFile(path.join(dir,'upgrade-proof.json'),JSON.stringify(proof));
  if(arch==='arm64')await fs.writeFile(path.join(input,'published-upgrade-proof.json'),JSON.stringify({...proof,baseVersion:'0.1.0',targetVersion:'0.1.1',targetZipSha256:assets[zip]}));
 }
 const {desktopUpdateFeed}=await import('../scripts/verify-update-assets.mjs');
 const metadata=await Promise.all(['arm64','x64'].map(async arch=>yaml.load(await fs.readFile(path.join(input,arch,'latest-mac.yml'),'utf8'))));
 const previousFile=path.join(input,'published-upgrade-proof.json'),previous=JSON.parse(await fs.readFile(previousFile,'utf8'));
 previous.updateFeedSha256=createHash('sha256').update(desktopUpdateFeed(...metadata,'darwin')).digest('hex');
 await fs.writeFile(previousFile,JSON.stringify(previous));
 assert.throws(()=>desktopUpdateFeed(metadata[1],metadata[0],'darwin'),/architecture/);
 const output=path.join(root,'out');await prepareMacRelease(input,output,'0.1.1');
 const merged=yaml.load(await fs.readFile(path.join(output,'latest-mac.yml'),'utf8'));assert.equal(merged.files.length,2);assert.match(merged.files[0].url,/arm64/);assert.match(merged.files[1].url,/x64/);
 await fs.writeFile(previousFile,JSON.stringify({...previous,nativeAdministratorAuthorization:false}));
 await assert.rejects(prepareMacRelease(input,path.join(root,'missing-authorization'),'0.1.1'),/administrator authorization/);
 await fs.writeFile(previousFile,JSON.stringify({...previous,updateFeedSha256:'0'.repeat(64)}));
 await assert.rejects(prepareMacRelease(input,path.join(root,'wrong-feed'),'0.1.1'),/same combined feed/);
 await fs.writeFile(previousFile,JSON.stringify(previous));
 const toolPath=path.join(input,'x64','MatiQ-Companion-0.1.1-darwin-x64.mqt'),originalTool=await fs.readFile(toolPath);await fs.writeFile(toolPath,'tampered');await assert.rejects(prepareMacRelease(input,path.join(root,'bad-tool'),'0.1.1'),/Unverified suite tool bytes/);await fs.writeFile(toolPath,originalTool);
 await fs.writeFile(path.join(input,'x64','MatiQ-Companion-0.1.1-mac-x64.pkg'),'tampered');
 await assert.rejects(prepareMacRelease(input,path.join(root,'bad'),'0.1.1'),/Unverified artifact bytes/);
 await assert.rejects(fs.stat(path.join(root,'bad')),{code:'ENOENT'});
});
