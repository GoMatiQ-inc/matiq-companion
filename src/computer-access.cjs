const { app, systemPreferences, desktopCapturer, shell } = require("electron");
function computerAccess() {
  const native=process.platform === "darwin" ? require("./native/mac-computer.node").access() : null;
  return process.platform === "darwin"
    ? { screen: systemPreferences.getMediaAccessStatus("screen"), input: native.accessibility && native.postEvents ? "granted" : "not-granted", postEvents:native.postEvents, accessibility:native.accessibility }
    : { screen: "available", input: "available" };
}
async function requestComputerAccess(kind) {
  if (process.platform !== "darwin") throw Error("Windows desktop access is available for normal desktop apps; elevated and secure windows are excluded.");
  if (kind === "screen") {
    let captureError;
    try { await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1, height: 1 } }); }
    catch (error) { captureError = error; }
    await shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
    if (captureError) throw Error(`Screen capture could not start: ${captureError.message} Enable ${app.getName()} in the Screen Recording settings that opened, then quit and reopen the app.`);
  } else if (kind === "input") {
    systemPreferences.isTrustedAccessibilityClient(true);
    require("./native/mac-computer.node").requestEvents();
    await shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility");
  } else throw Error("Choose Screen Recording or Accessibility access.");
  return computerAccess();
}
module.exports = { computerAccess, requestComputerAccess };
