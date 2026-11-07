const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
test("desktop packages use the committed MatiQ icon with native Mac and Windows sizes", () => {
  const root = path.resolve(__dirname,".."), config = require("../package.json").build;
  assert.equal(config.mac.icon,"build/icon.icns");assert.equal(config.win.icon,"build/icon.ico");
  const mac = fs.readFileSync(path.join(root,config.mac.icon));
  assert.equal(mac.toString("ascii",0,4),"icns");assert.equal(mac.readUInt32BE(4),mac.length);
  const sizes=[];let cursor=8;
  while(cursor<mac.length) {sizes.push(mac.toString("ascii",cursor,cursor+4));const length=mac.readUInt32BE(cursor+4);assert.ok(length>8);cursor+=length;}
  assert.equal(cursor,mac.length);assert.ok(sizes.includes("ic10") && sizes.includes("icp4"));
  const win = fs.readFileSync(path.join(root,config.win.icon));
  assert.equal(win.readUInt16LE(2),1);assert.equal(win.readUInt16LE(4),4);
  for(let i=0;i<4;i++){const offset=win.readUInt32LE(6+i*16+12),bytes=win.readUInt32LE(6+i*16+8);assert.ok(offset+bytes<=win.length);assert.equal(win.subarray(offset+1,offset+4).toString(),"PNG");}
});
