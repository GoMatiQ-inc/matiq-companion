import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import yaml from 'js-yaml';
import {verifyUpdateAssets} from './verify-update-assets.mjs';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export async function prepareMacRelease(input, output, version) {
  assert.match(version,/^\d+\.\d+\.\d+$/);
  const published = new Map(), metadata = [];
  for (const arch of ['arm64','x64']) {
    const directory=path.join(input,arch);
    const read=async name=>JSON.parse(await fs.readFile(path.join(directory,name),'utf8'));
    const proof=await read('mac-signature.json'), upgrade=await read('upgrade-proof.json');
    const pkg=`MatiQ-Companion-${version}-mac-${arch}.pkg`, zip=`MatiQ-Companion-${version}-mac-${arch}.zip`;
    assert.equal(proof.version,version); assert.equal(proof.arch,arch); assert.equal(proof.platform,'darwin');
    assert.equal(proof.artifact,pkg);
    for(const key of ['signed','notarized','stapled']) assert.equal(proof[key],true);
    assert.equal(upgrade.installation,'system-pkg','Qualify the actual installed PKG upgrade path.');
    assert.equal(upgrade.arch,arch); assert.equal(upgrade.baseVersion,version);
    for(const key of ['signedDownloadRestart','automaticRelaunch']) assert.equal(upgrade[key],true);
    for(const key of ['project','settings','modelSha256','generatedFile']) assert.equal(upgrade.retained[key],true);
    assert.equal(upgrade.baseZipSha256,proof.assets[zip]);
    const names=Object.keys(proof.assets).sort();
    const expected=[pkg,zip,'latest-mac.yml'];
    if(names.includes(zip+'.blockmap')) expected.push(zip+'.blockmap');
    assert.deepEqual(names,expected.sort(),'Signature proof must cover exactly the downloadable artifacts.');
    const present=(await fs.readdir(directory)).filter(n=>!['builder-debug.yml','mac-signature.json','upgrade-proof.json'].includes(n)).sort();
    assert.deepEqual(present,names,'Reject unverified or missing artifacts.');
    for(const name of names) {
      const bytes=await fs.readFile(path.join(directory,name));
      assert.equal(digest(bytes),proof.assets[name],`Unverified artifact bytes: ${name}`);
      if(name===pkg) assert.equal(digest(bytes),proof.sha256);
      if(name!=='latest-mac.yml') published.set(name,bytes);
    }
    await verifyUpdateAssets(directory,version,'darwin',arch);
    metadata.push(yaml.load(await fs.readFile(path.join(directory,'latest-mac.yml'),'utf8')));
    if(arch==='arm64') {
      const previous=JSON.parse(await fs.readFile(path.join(input,'published-upgrade-proof.json'),'utf8'));
      assert.equal(previous.installation,'system-pkg');
      assert.equal(previous.targetVersion,version); assert.equal(previous.targetZipSha256,proof.assets[zip]);
      assert.match(previous.baseVersion,/^\d+\.\d+\.\d+$/);
      assert.notEqual(previous.baseVersion,version);
      for(const key of ['signedDownloadRestart','automaticRelaunch']) assert.equal(previous[key],true);
      for(const key of ['project','settings','modelSha256','generatedFile']) assert.equal(previous.retained[key],true);
    }
  }
  const merged={...metadata[1],files:metadata.flatMap(m=>m.files)};
  published.set('latest-mac.yml',Buffer.from(yaml.dump(merged)));
  await fs.mkdir(output,{recursive:true});
  assert.deepEqual(await fs.readdir(output),[],'Use an empty task-owned release output directory.');
  const sums=[];
  for(const [name,bytes] of [...published].sort(([a],[b])=>a.localeCompare(b))) {
    await fs.writeFile(path.join(output,name),bytes);
    sums.push(`${digest(bytes)}  ${name}`);
  }
  await fs.writeFile(path.join(output,'SHA256SUMS.txt'),sums.join('\n')+'\n');
  return [...published.keys()];
}
if(process.argv[1] && fileURLToPath(import.meta.url)===path.resolve(process.argv[1])) {
  const version=JSON.parse(await fs.readFile('package.json','utf8')).version;
  await prepareMacRelease('qualified-assets','release-assets',version);
}
