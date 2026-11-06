const { systemPreferences, desktopCapturer, shell } = require("electron");
function computerAccess() {
  return process.platform === "darwin"
    ? { screen: systemPreferences.getMediaAccessStatus("screen"), input: systemPreferences.isTrustedAccessibilityClient(false) ? "granted" : "not-granted" }
    : { screen: "available", input: "available" };
}
async function requestComputerAccess(kind) {
  if (process.platform !== "darwin") throw Error("Windows desktop access is available for normal desktop apps; elevated and secure windows are excluded.");
  if (kind === "screen") {
    await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1, height: 1 } });
    await shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
  } else if (kind === "input") {
    systemPreferences.isTrustedAccessibilityClient(true);
    await shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility");
  } else throw Error("Choose Screen Recording or Accessibility access.");
  return computerAccess();
}
module.exports = { computerAccess, requestComputerAccess };
