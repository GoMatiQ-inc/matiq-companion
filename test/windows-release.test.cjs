const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
const {verifyPEArchitecture}=require('../scripts/verify-pe-architecture.cjs');
test('Windows architecture rejects mismatched and malformed executable headers',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'companion-pe-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const file=path.join(root,'fixture.exe'),bytes=Buffer.alloc(128);
 bytes.writeUInt16LE(0x5a4d,0);bytes.writeUInt32LE(80,60);bytes.writeUInt32LE(0x4550,80);bytes.writeUInt16LE(0xaa64,84);
 await fs.writeFile(file,bytes);await verifyPEArchitecture(file,'arm64');
 await assert.rejects(verifyPEArchitecture(file,'x64'),/native Windows architecture/);
 bytes.writeUInt32LE(1000,60);await fs.writeFile(file,bytes);await assert.rejects(verifyPEArchitecture(file,'arm64'),/outside the file/);
 bytes.writeUInt16LE(0,0);await fs.writeFile(file,bytes);await assert.rejects(verifyPEArchitecture(file,'arm64'),/Windows executable/);
});
test('Windows publication requires verified bytes, one company publisher and actual prior-version proofs',async t=>{
 const {prepareWindowsRelease}=await import('../scripts/prepare-windows-release.mjs');
 const {desktopUpdateFeed}=await import('../scripts/verify-update-assets.mjs');
 const yaml=require('js-yaml'),root=await fs.mkdtemp(path.join(os.tmpdir(),'companion-windows-release-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const input=path.join(root,'in');await fs.mkdir(input);
 const retained={project:true,settings:true,modelSha256:true,generatedFile:true},metadata=[],reports={};
 const previous={tagName:'v0.1.0',assets:[]};
 for(const arch of ['arm64','x64']){
  const dir=path.join(input,arch);await fs.mkdir(dir);
  const exe=`MatiQ-Companion-0.1.1-windows-${arch}.exe`,bytes=Buffer.from('fixture-'+arch);
  const meta={version:'0.1.1',files:[{url:exe,size:bytes.length,sha512:createHash('sha512').update(bytes).digest('base64')}]};metadata.push(meta);
  const data={[exe]:bytes,'latest.yml':Buffer.from(yaml.dump(meta))},assets={};
  for(const[name,body]of Object.entries(data)){await fs.writeFile(path.join(dir,name),body);assets[name]=createHash('sha256').update(body).digest('hex');}
  const report={platform:'win32',arch,version:'0.1.1',artifact:exe,signed:true,timestamped:true,nativeArchitectureVerified:true,filesChecked:4,publisher:'Fixture Publisher',assets,sha256:assets[exe]};reports[arch]=report;
  await fs.writeFile(path.join(dir,'windows-signature.json'),JSON.stringify(report));
  await fs.writeFile(path.join(dir,'upgrade-proof.json'),JSON.stringify({platform:'win32',arch,baseVersion:'0.1.1',targetVersion:'0.1.2',installation:'per-user-nsis',nativeArchitectureVerified:true,signedDownloadRestart:true,automaticRelaunch:true,baseZipSha256:assets[exe],retained}));
  await fs.writeFile(path.join(dir,'published-windows-proof.json'),JSON.stringify({initialWindowsRelease:true,platform:'win32',arch,targetVersion:'0.1.1',observedPublicTag:'v0.1.0'}));
 }
 const output=path.join(root,'out');await prepareWindowsRelease(input,output,'0.1.1',previous);
 const feed=yaml.load(await fs.readFile(path.join(output,'latest.yml'),'utf8'));assert.equal(feed.files.length,2);assert.match(feed.files[0].url,/arm64/);assert.match(feed.files[1].url,/x64/);
 const reportFile=path.join(input,'x64','windows-signature.json');
 await fs.writeFile(reportFile,JSON.stringify({...reports.x64,publisher:'Different Publisher'}));
 await assert.rejects(prepareWindowsRelease(input,path.join(root,'wrong-publisher'),'0.1.1',previous),/same issued company identity/);
 await fs.writeFile(reportFile,JSON.stringify(reports.x64));
 previous.assets=['arm64','x64'].map(arch=>({name:`MatiQ-Companion-0.1.0-windows-${arch}.exe`}));
 await assert.rejects(prepareWindowsRelease(input,path.join(root,'skipped-upgrade'),'0.1.1',previous),/skip an existing public Windows/);
 const feedHash=createHash('sha256').update(desktopUpdateFeed(...metadata,'win32')).digest('hex');
 for(const arch of ['arm64','x64'])await fs.writeFile(path.join(input,arch,'published-windows-proof.json'),JSON.stringify({initialWindowsRelease:false,observedPublicTag:'v0.1.0',platform:'win32',arch,baseVersion:'0.1.0',targetVersion:'0.1.1',installation:'per-user-nsis',nativeArchitectureVerified:true,signedDownloadRestart:true,automaticRelaunch:true,targetZipSha256:reports[arch].sha256,updateFeedSha256:feedHash,retained}));
 await prepareWindowsRelease(input,path.join(root,'previous-qualified'),'0.1.1',previous);
 await fs.writeFile(path.join(input,'x64','MatiQ-Companion-0.1.1-windows-x64.exe'),'altered');
 await assert.rejects(prepareWindowsRelease(input,path.join(root,'altered'),'0.1.1',previous),/Unverified Windows artifact/);
 await assert.rejects(fs.stat(path.join(root,'altered')),{code:'ENOENT'});
});
