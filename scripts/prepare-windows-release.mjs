import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import yaml from 'js-yaml';
import {verifyUpdateAssets,desktopUpdateFeed} from './verify-update-assets.mjs';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function prepareWindowsRelease(input,output,version,previous){
  assert.match(version,/^\d+\.\d+\.\d+$/);
  assert.match(previous.tagName,/^v\d+\.\d+\.\d+$/);
  const published=new Map(),metadata=[];
  let publisher;
  for(const arch of ['arm64','x64']){
    const directory=path.join(input,arch),read=async name=>JSON.parse(await fs.readFile(path.join(directory,name),'utf8'));
    const proof=await read('windows-signature.json'),upgrade=await read('upgrade-proof.json'),prior=await read('published-windows-proof.json');
    const installer=`MatiQ-Companion-${version}-windows-${arch}.exe`;
    assert.equal(proof.platform,'win32');assert.equal(proof.arch,arch);assert.equal(proof.version,version);assert.equal(proof.artifact,installer);
    for(const key of ['signed','timestamped','nativeArchitectureVerified'])assert.equal(proof[key],true);
    assert.ok(Number.isInteger(proof.filesChecked)&&proof.filesChecked>=3,'Verify the installer, application and native libraries.');
    assert.ok(typeof proof.publisher==='string'&&proof.publisher.trim(),'Require the issued certificate publisher.');
    if(publisher)assert.equal(proof.publisher,publisher,'Both architectures must use the same issued company identity.');
    publisher=proof.publisher;
    assert.equal(upgrade.installation,'per-user-nsis');assert.equal(upgrade.platform,'win32');assert.equal(upgrade.arch,arch);assert.equal(upgrade.baseVersion,version);
    for(const key of ['signedDownloadRestart','automaticRelaunch','nativeArchitectureVerified'])assert.equal(upgrade[key],true);
    for(const key of ['project','settings','modelSha256','generatedFile'])assert.equal(upgrade.retained[key],true);
    assert.equal(upgrade.baseZipSha256,proof.assets[installer]);
    const names=Object.keys(proof.assets).sort(),expected=[installer,'latest.yml'];
    if(names.includes(installer+'.blockmap'))expected.push(installer+'.blockmap');
    assert.deepEqual(names,expected.sort(),'Publish only signature-verified update assets.');
    const present=(await fs.readdir(directory)).filter(n=>!['windows-signature.json','upgrade-proof.json','published-windows-proof.json'].includes(n)).sort();
    assert.deepEqual(present,names,'Reject unverified or missing Windows release files.');
    for(const name of names){const bytes=await fs.readFile(path.join(directory,name));assert.equal(digest(bytes),proof.assets[name],`Unverified Windows artifact bytes: ${name}`);if(name===installer)assert.equal(digest(bytes),proof.sha256);if(name!=='latest.yml')published.set(name,bytes);}
    await verifyUpdateAssets(directory,version,'win32',arch);
    metadata.push(yaml.load(await fs.readFile(path.join(directory,'latest.yml'),'utf8')));
    assert.equal(prior.observedPublicTag,previous.tagName,'Requalify against the current public release.');
    assert.equal(prior.platform,'win32');assert.equal(prior.arch,arch);assert.equal(prior.targetVersion,version);
    const priorName=`MatiQ-Companion-${previous.tagName.slice(1)}-windows-${arch}.exe`;
    const hasPrevious=previous.assets.some(asset=>asset.name===priorName);
    assert.equal(prior.initialWindowsRelease,!hasPrevious,'Do not skip an existing public Windows installation.');
    if(hasPrevious){
      assert.equal(prior.installation,'per-user-nsis');assert.equal(prior.platform,'win32');assert.equal(prior.arch,arch);assert.equal(prior.baseVersion,previous.tagName.slice(1));assert.equal(prior.targetVersion,version);assert.equal(prior.targetZipSha256,proof.assets[installer]);
      for(const key of ['signedDownloadRestart','automaticRelaunch','nativeArchitectureVerified'])assert.equal(prior[key],true);
      for(const key of ['project','settings','modelSha256','generatedFile'])assert.equal(prior.retained[key],true);
    }
  }
  const feed=Buffer.from(desktopUpdateFeed(metadata[0],metadata[1],'win32'));
  for(const arch of ['arm64','x64']){
    const prior=JSON.parse(await fs.readFile(path.join(input,arch,'published-windows-proof.json'),'utf8'));
    if(!prior.initialWindowsRelease)assert.equal(prior.updateFeedSha256,digest(feed),'Publish the same combined Windows feed qualified by installed users upgrading.');
  }
  published.set('latest.yml',feed);
  await fs.mkdir(output,{recursive:true});assert.deepEqual(await fs.readdir(output),[],'Use an empty task-owned Windows release directory.');
  for(const [name,bytes]of published)await fs.writeFile(path.join(output,name),bytes);
  return [...published.keys()];
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  const version=JSON.parse(await fs.readFile('package.json','utf8')).version;
  await prepareWindowsRelease('qualified-assets/windows','windows-release-assets',version,JSON.parse(await fs.readFile('qualified-assets/previous-release.json','utf8')));
}
