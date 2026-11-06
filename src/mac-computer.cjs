async function macInput(action, args, display, signal, target) {
  const native = require("./native/mac-computer.node");
  if (action === "click_screen") return native.click(display.bounds.x + args.x, display.bounds.y + args.y);
  await activateTarget(target,signal);
  if (action === "press_key") {
    const keys = { Enter: 36, Escape: 53, Tab: 48, Backspace: 51, Left: 123, Right: 124, Up: 126, Down: 125 };
    if (!Object.hasOwn(keys, args.key)) throw Error("Choose a supported key.");
    return native.key(keys[args.key]);
  }
  // Keep Quartz events short and preserve surrogate pairs. Yield so Stop can cancel further chunks.
  let chunk = "";
  for (const character of args.text) {
    if (signal?.aborted) throw Error("Task stopped.");
    if (chunk.length + character.length > 16) {
      native.type(chunk);
      await new Promise((resolve) => setTimeout(resolve, 5));
      chunk = "";
    }
    chunk += character;
  }
  if (signal?.aborted) throw Error("Task stopped.");
  if (chunk) native.type(chunk);
}
async function activateTarget(target,signal){
  const native=require("./native/mac-computer.node");
  native.focus(target);
  const deadline=Date.now()+1500;
  while(native.foreground()!==target) {
    if(signal?.aborted)throw Error("Task stopped.");
    if(Date.now()>=deadline)throw Error("The clicked application did not activate. Click its field and observe again.");
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  if(signal?.aborted)throw Error("Task stopped.");
}
module.exports = { macInput, activateTarget };
