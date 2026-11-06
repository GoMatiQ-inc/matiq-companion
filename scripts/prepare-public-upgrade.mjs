import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const repository=process.env.GITHUB_REPOSITORY;
assert.equal(repository,'GoMatiQ-inc/matiq-companion','Use the official Companion repository for public upgrade qualification.');
assert.ok(['darwin','win32'].includes(process.platform),'Qualify a public upgrade on its native supported platform.');
assert.ok(['arm64','x64'].includes(process.arch));
const current=JSON.parse(await fs.readFile('package.json','utf8')).version;
const release=JSON.parse(execFileSync('gh',['release','view','--repo',repository,'--json','tagName,assets'],{encoding:'utf8',timeout:30000}));
assert.match(current,/^\d+\.\d+\.\d+$/);assert.match(release.tagName,/^v\d+\.\d+\.\d+$/);
const previous=release.tagName.slice(1),a=current.split('.').map(Number),b=previous.split('.').map(Number);
assert.ok(a.some((value,i)=>value>b[i]&&a.slice(0,i).every((n,j)=>n===b[j])),'Bump the version before qualifying against the current public release.');
const windows=process.platform==='win32';
const installer=`MatiQ-Companion-${previous}-${windows?'windows':'mac'}-${process.arch}.${windows?'exe':'pkg'}`;
const initial=windows&&!release.assets.some(asset=>asset.name===installer);
await fs.mkdir('dist',{recursive:true});
await fs.appendFile(process.env.GITHUB_OUTPUT,`has_previous=${initial?'0':'1'}\n`);
await fs.appendFile(process.env.GITHUB_ENV,`COMPANION_UPGRADE_BASE_VERSION=${previous}\nCOMPANION_UPGRADE_TARGET_VERSION=${current}\nCOMPANION_PREVIOUS_PUBLIC_TAG=${release.tagName}\n`);
if(initial){
  await fs.writeFile('dist/published-windows-proof.json',JSON.stringify({initialWindowsRelease:true,platform:'win32',arch:process.arch,targetVersion:current,observedPublicTag:release.tagName},null,2)+'\n');
  console.log(`Initial Windows ${process.arch} release: ${release.tagName} has no public installer for this architecture. Candidate signed two-version qualification is still required.`);
}else{
  const names=windows?[installer]:[installer,`MatiQ-Companion-${previous}-mac-${process.arch}.zip`];
  const args=['release','download',release.tagName,'--repo',repository,'--dir','dist','--pattern','SHA256SUMS.txt'];
  for(const name of names)args.push('--pattern',name);
  execFileSync('gh',args,{stdio:'inherit',timeout:120000});
  const sums=(await fs.readFile('dist/SHA256SUMS.txt','utf8')).split(/\r?\n/);
  for(const name of names){
    const expected=sums.map(line=>line.trim().split(/\s+/)).filter(parts=>parts[1]===name);
    assert.equal(expected.length,1,`Require one published checksum for ${name}.`);
    const hash=createHash('sha256');for await(const bytes of createReadStream('dist/'+name))hash.update(bytes);
    assert.equal(hash.digest('hex'),expected[0][0],`Published installer checksum mismatch: ${name}`);
  }
  console.log('Verified the actual previous public installer bytes for native upgrade qualification.');
}
