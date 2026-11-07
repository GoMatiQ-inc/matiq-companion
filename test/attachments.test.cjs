const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const {Projects} = require("../src/projects.cjs");
const {readAttachments} = require("../src/attachments.cjs");
const docs = require("../src/documents.cjs");
test("ordinary chats stay distinct from existing projects and selected attachments require live grants", async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "companion-attachments-")));
  t.after(() => fs.rm(root, {recursive:true,force:true}));
  const projects = new Projects(path.join(root, "profile", "projects"));
  const chat = await projects.create("New chat", "chat");
  const old = await projects.create("Existing project");
  await projects.update(old.id, p => {delete p.kind;});
  assert.equal((await projects.list()).find(p => p.id === old.id).kind, "project");
  assert.equal((await projects.list()).find(p => p.id === chat.id).kind, "chat");
  const file = path.join(root, "note.txt");
  await fs.writeFile(file, "selected content");
  await projects.update(chat.id, p => p.grants.push({id:"chosen",root:file,write:false,attachment:true}));
  assert.equal((await readAttachments(projects,chat.id,["chosen"]))[0].text,"selected content");
  await assert.rejects(readAttachments(projects,chat.id,["forged"]),/removed/);
  await assert.rejects(readAttachments(projects,chat.id,["chosen"],[root]),/protected|application/i);
  await projects.update(chat.id, p => {p.grants=[];});
  await assert.rejects(readAttachments(projects,chat.id,["chosen"]),/removed/);
  await assert.rejects(readAttachments(projects,chat.id,Array(7).fill("chosen")),/six/);
});
test("attachment extraction reads Office files and marks bounded text excerpts without claiming image support", async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "companion-attachment-formats-")));
  t.after(() => fs.rm(root,{recursive:true,force:true}));
  const projects = new Projects(path.join(root,"profile","projects")), chat = await projects.create("New chat","chat");
  async function attach(name,bytes) {
    const file=path.join(root,name);await fs.writeFile(file,bytes);
    await projects.update(chat.id,p=>p.grants.push({id:name,root:file,write:false,attachment:true}));
    return readAttachments(projects,chat.id,[name]);
  }
  assert.match((await attach("note.docx",await docs.createWord("Title",["Word content"])))[0].text,/Word content/);
  assert.match((await attach("sheet.xlsx",await docs.createWorkbook("Sheet",[["Excel content"]])))[0].text,/Excel content/);
  const excerpt=(await attach("long.txt","a".repeat(25000)))[0];
  assert.equal(excerpt.text.length,24000);assert.equal(excerpt.truncated,true);
  await assert.rejects(attach("image.png",Buffer.from([0,1,2])),/not supported/);
});
