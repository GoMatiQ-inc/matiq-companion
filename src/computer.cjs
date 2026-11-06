const {desktopCapturer,screen}=require('electron');
const {createWorker}=require('tesseract.js');
const language=require('@tesseract.js-data/eng');
let observation=null;
function createComputer(window){return async(name,args,signal)=>{if(signal?.aborted)throw Error('Task stopped.');window.hide();try{await new Promise(r=>setTimeout(r,350));if(signal?.aborted)throw Error('Task stopped.');const display=screen.getPrimaryDisplay();
 if(name==='observe_screen'){
  const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:Math.min(1920,display.size.width*display.scaleFactor),height:Math.min(1200,display.size.height*display.scaleFactor)}});const source=sources.find(s=>s.display_id===String(display.id));if(!source||source.thumbnail.isEmpty())throw Error('Screen capture is unavailable. Grant screen-recording access and retry.');
  const worker=await createWorker('eng',1,{langPath:language.langPath,gzip:true,cacheMethod:'none'});let timer;
  try{const recognized=await Promise.race([worker.recognize(source.thumbnail.toPNG(),{}, {blocks:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Screen reading timed out.')),25000);})]);const size=source.thumbnail.getSize();const words=[];for(const b of recognized.data.blocks||[])for(const p of b.paragraphs||[])for(const l of p.lines||[])for(const w of l.words||[])words.push({text:w.text,x:Math.round((w.bbox.x0+w.bbox.x1)/2*display.size.width/size.width),y:Math.round((w.bbox.y0+w.bbox.y1)/2*display.size.height/size.height),confidence:w.confidence});observation={time:Date.now(),display:display.id,width:display.size.width,height:display.size.height};return {...observation,text:recognized.data.text.slice(0,12000),words:words.slice(0,300),note:'Coordinates are primary-screen logical pixels. OCR is imperfect; inspect before acting.'};}finally{clearTimeout(timer);await worker.terminate();}
 }
 if(!observation||Date.now()-observation.time>30000||observation.display!==display.id)throw Error('Observe the screen again before computer actions; the last observation is missing or stale.');
 const nut=require('@nut-tree-fork/nut-js');
 if(name==='click_screen'){if(args.x<0||args.y<0||args.x>=display.size.width||args.y>=display.size.height)throw Error('Choose coordinates inside the observed primary display.');await nut.mouse.setPosition(new nut.Point(display.bounds.x+args.x,display.bounds.y+args.y));await nut.mouse.click(nut.Button.LEFT);}
 else if(name==='type_text'){if(args.text.length>4000)throw Error('Type at most 4000 characters per action.');await nut.keyboard.type(args.text);}
 else if(name==='press_key'){const keys={Enter:nut.Key.Return,Escape:nut.Key.Escape,Tab:nut.Key.Tab,Backspace:nut.Key.Backspace,Left:nut.Key.Left,Right:nut.Key.Right,Up:nut.Key.Up,Down:nut.Key.Down};await nut.keyboard.pressKey(keys[args.key]);await nut.keyboard.releaseKey(keys[args.key]);}
 else throw Error('Unknown computer action.');observation=null;return {attempted:true,note:'Input dispatched. Observe again to verify the outcome; success in the target application is not implied.'};
 }finally{window.show();window.focus();}};}
module.exports={createComputer};
