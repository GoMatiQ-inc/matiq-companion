const native = () => require("./native/windows-computer.node");
function foregroundWindow() { return native().foreground(); }
async function windowsInput(action, args, display, signal, target) {
  if (signal?.aborted) throw Error("Task stopped.");
  const input = native();
  if (action === "click_screen") return input.click((display.bounds.x + args.x) * display.scaleFactor, (display.bounds.y + args.y) * display.scaleFactor);
  input.focus(target);
  await new Promise((resolve) => setTimeout(resolve, 50));
  if (signal?.aborted) throw Error("Task stopped.");
  if (action === "press_key") {
    const keys = { Enter: 13, Escape: 27, Tab: 9, Backspace: 8, Left: 37, Up: 38, Right: 39, Down: 40 };
    if (!Object.hasOwn(keys, args.key)) throw Error("Choose a supported key.");
    return input.key(keys[args.key]);
  }
  let chunk = "";
  for (const character of args.text) {
    if (signal?.aborted) throw Error("Task stopped.");
    if (chunk.length + character.length > 16) { input.type(chunk); await new Promise((resolve) => setTimeout(resolve, 5)); chunk = ""; }
    chunk += character;
  }
  if (signal?.aborted) throw Error("Task stopped.");
  if (chunk) input.type(chunk);
}
function captureScreen() {
  const frame=native().capture();
  const ratio=Math.min(1,1920/frame.width,1200/frame.height);
  return require('electron').nativeImage.createFromBitmap(frame.pixels,{width:frame.width,height:frame.height}).resize({width:Math.round(frame.width*ratio),height:Math.round(frame.height*ratio)});
}
module.exports = { windowsInput, foregroundWindow, captureScreen };
