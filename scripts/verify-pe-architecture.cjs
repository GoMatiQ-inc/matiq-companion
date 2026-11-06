const fs=require('node:fs/promises');
const assert=require('node:assert/strict');
async function verifyPEArchitecture(file,arch){
  assert.ok(['x64','arm64'].includes(arch),'Choose a supported Windows architecture.');
  const handle=await fs.open(file,'r');
  try {
    const dos=Buffer.alloc(64);
    assert.equal((await handle.read(dos,0,64,0)).bytesRead,64,'Read the complete executable DOS header.');
    assert.equal(dos.readUInt16LE(0),0x5a4d,'The installed file must be a Windows executable.');
    const offset=dos.readUInt32LE(60),size=(await handle.stat()).size;
    assert.ok(offset>=64 && offset<=size-24,'The executable PE header is outside the file.');
    const pe=Buffer.alloc(24);
    assert.equal((await handle.read(pe,0,24,offset)).bytesRead,24,'Read the complete executable PE header.');
    assert.equal(pe.readUInt32LE(0),0x4550,'The executable PE signature is invalid.');
    assert.equal(pe.readUInt16LE(4),arch==='arm64'?0xaa64:0x8664,'The app must use the native Windows architecture, without emulation masking the wrong update.');
  } finally {await handle.close();}
}
module.exports={verifyPEArchitecture};
