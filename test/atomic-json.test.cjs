const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
async function writer(t, platform, code, failures) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),"companion-atomic-"));
  t.after(() => fs.rm(root,{recursive:true,force:true}));
  const file = path.join(root,"record.json"), original = '{"old":true}\n';
  await fs.writeFile(file,original);
  let attempts=0;
  const context = {module:{exports:{}},process:{platform},setTimeout:resolve=>queueMicrotask(resolve),
    require(name) {
      if(name!=="node:fs/promises")return require(name);
      return {...fs,async rename(from,to) {
        attempts++;
        assert.equal(to,file);
        assert.equal(await fs.readFile(file,"utf8"),original,"The original must remain available throughout replacement retries.");
        if(attempts<=failures)throw Object.assign(Error("Replacement is locked"),{code});
        return fs.rename(from,to);
      }};
    },
  };
  vm.runInNewContext(await fs.readFile(require.resolve("../src/projects.cjs"),"utf8"),context);
  return {save:()=>context.module.exports.atomicJSON(file,{new:true}),attempts:()=>attempts,file,root,original};
}
test("Windows atomic saves retry transient locks without removing the original", async t => {
  for(const code of ["EPERM","EACCES","EBUSY"]) {
    const f=await writer(t,"win32",code,2);
    await f.save();assert.equal(f.attempts(),3);
    assert.deepEqual(JSON.parse(await fs.readFile(f.file,"utf8")),{new:true});
    assert.deepEqual(await fs.readdir(f.root),["record.json"]);
  }
});
test("persistent and unrelated save errors fail visibly, preserve the original and clean the temporary file", async t => {
  for(const [platform,code,failures,attempts] of [["win32","EPERM",Infinity,41],["linux","EPERM",1,1],["win32","EIO",1,1]]) {
    const f=await writer(t,platform,code,failures);
    await assert.rejects(f.save(),error=>error.code===code);
    assert.equal(f.attempts(),attempts);
    assert.equal(await fs.readFile(f.file,"utf8"),f.original);
    assert.deepEqual(await fs.readdir(f.root),["record.json"]);
  }
});
