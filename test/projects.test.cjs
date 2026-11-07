const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),os=require("node:os");
const {Projects}=require("../src/projects.cjs");
async function fixture(t) {
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),"companion-publication-")));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  return new Projects(path.join(root,"projects"));
}
test("conversation lists never observe an unpublished metadata directory",async t=>{
  const projects=await fixture(t),rename=fs.rename;
  let unblock,entered;const held=new Promise(r=>entered=r),release=new Promise(r=>unblock=r);
  t.mock.method(fs,"rename",async(from,to)=>{if(path.basename(from).startsWith(".creating-")){entered();await release;}return rename(from,to);});
  const pending=projects.create("Chat","chat");
  try {await held;assert.deepEqual(await projects.list(),[]);}
  finally {unblock();}
  const chat=await pending;
  assert.equal((await projects.list())[0].id,chat.id);
  assert.equal((await projects.get(chat.id)).kind,"chat");
  assert.ok((await fs.stat(path.join(projects.folder(chat.id),"files"))).isDirectory());
});
test("conversation reads wait for a queued permission save",async t=>{
  const projects=await fixture(t),chat=await projects.create("Chat","chat"),rename=fs.rename;
  let unblock,entered;const held=new Promise(r=>entered=r),release=new Promise(r=>unblock=r);
  t.mock.method(fs,"rename",async(from,to)=>{if(to.endsWith("project.json")){entered();await release;}return rename(from,to);});
  const update=projects.update(chat.id,p=>{p.tools.search=true;});
  await held;
  let returned=false;const read=projects.get(chat.id).then(p=>{returned=true;return p;});
  try {await new Promise(r=>setImmediate(r));assert.equal(returned,false);}
  finally {unblock();}
  await update;assert.equal((await read).tools.search,true);
});
