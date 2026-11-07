const {app, BrowserWindow, nativeImage} = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const timer = setTimeout(() => {console.error("Icon rendering timed out.");app.exit(1);}, 30000);
app.whenReady().then(async () => {
  let window;
  try {
    const svg = await fs.readFile(path.join(root, "build/app-icon.svg"), "utf8");
    window = new BrowserWindow({width:1024,height:1024,useContentSize:true,show:false,transparent:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
    await window.loadURL("data:text/html," + encodeURIComponent('<body style="margin:0;background:transparent">' + svg.replace('viewBox=', 'width="1024" height="1024" viewBox=') + '</body>'));
    const data = await window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{const c=document.createElement("canvas");c.width=c.height=1024;c.getContext("2d").drawImage(image,0,0,1024,1024);resolve(c.toDataURL("image/png"));};image.onerror=()=>reject(Error("Cannot render the brand icon."));image.src=${JSON.stringify("data:image/svg+xml;base64,"+Buffer.from(svg).toString("base64"))};})`);
    const image = nativeImage.createFromDataURL(data);
    await fs.writeFile(path.join(root,"src/ui/assets/app-icon.png"),image.toPNG());
    const icns = [];
    for (const [size,type] of [[16,"icp4"],[32,"icp5"],[64,"icp6"],[128,"ic07"],[256,"ic08"],[512,"ic09"],[1024,"ic10"]]) {
      const png = image.resize({width:size,height:size,quality:"best"}).toPNG();
      const header = Buffer.alloc(8);header.write(type);header.writeUInt32BE(png.length+8,4);
      icns.push(header,png);
    }
    const icnsHeader=Buffer.alloc(8);icnsHeader.write("icns");icnsHeader.writeUInt32BE(8+icns.reduce((n,b)=>n+b.length,0),4);
    await fs.writeFile(path.join(root,"build/icon.icns"),Buffer.concat([icnsHeader,...icns]));
    const sizes=[16,32,48,256], icons=sizes.map(size=>image.resize({width:size,height:size,quality:"best"}).toPNG());
    const icoHeader=Buffer.alloc(6+16*sizes.length);icoHeader.writeUInt16LE(1,2);icoHeader.writeUInt16LE(sizes.length,4);
    let offset=icoHeader.length;
    icons.forEach((png,i)=>{const start=6+i*16;icoHeader[start]=sizes[i]%256;icoHeader[start+1]=sizes[i]%256;icoHeader.writeUInt16LE(1,start+4);icoHeader.writeUInt16LE(32,start+6);icoHeader.writeUInt32LE(png.length,start+8);icoHeader.writeUInt32LE(offset,start+12);offset+=png.length;});
    await fs.writeFile(path.join(root,"build/icon.ico"),Buffer.concat([icoHeader,...icons]));
    console.log("PASS: branded PNG, ICNS and multi-size ICO generated from the existing MatiQ mark.");
  } finally {window?.destroy();clearTimeout(timer);app.quit();}
}).catch(error=>{console.error(error);clearTimeout(timer);app.exit(1);});
